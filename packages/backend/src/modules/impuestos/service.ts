import { Money } from "@erp/core/money";
import { desc, eq } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { impuestos, retencionesIibb } from "../../db/schema/impuestos.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { leerParametros } from "../parametros/service.js";
import { type Obligacion, obligacionesImpositivas, posicionIva } from "./obligaciones.js";
import {
  type ImpuestoActualizar,
  type ImpuestoInput,
  type ImpuestosListar,
  type RetencionActualizar,
  type RetencionInput,
  TIPOS_POR_REGIMEN,
} from "./schema.js";

export type Impuesto = typeof impuestos.$inferSelect;
export type Retencion = typeof retencionesIibb.$inferSelect;
export type { Obligacion };

export class ImpuestoInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ImpuestoInvalidoError";
  }
}

/**
 * El listado es de obligaciones, no de filas: incluye las posiciones de IVA
 * que calcula el sistema aunque no tengan una fila detrás. Por eso filtra,
 * ordena y pagina en memoria: son decenas por empresa, no miles.
 */
export async function listarImpuestos(
  { tenantId }: Actor,
  input: ImpuestosListar,
): Promise<{
  items: Obligacion[];
  total: number;
  totalAdeudado: string;
  cantidadVencidos: number;
}> {
  return withTenant(tenantId, async (tx) => {
    const todas = await obligacionesImpositivas(tx, tenantId);
    const fecha = (o: Obligacion) =>
      input.campoFecha === "periodo" ? o.periodo : o.fechaVencimiento;

    const filtradas = todas.filter(
      (o) =>
        (!input.tipo || o.tipo === input.tipo) &&
        (!input.soloImpagos || o.estado !== "pagado") &&
        (!input.desde || fecha(o) >= input.desde) &&
        (!input.hasta || fecha(o) <= input.hasta),
    );

    const clave = (o: Obligacion): string => {
      switch (input.orden) {
        case "periodo":
          return o.periodo;
        case "tipo":
          return o.tipo;
        case "importeDeterminado":
          // Ordenar importes como texto exige que tengan el mismo largo.
          return o.importeDeterminado.padStart(20, "0");
        default:
          return o.fechaVencimiento;
      }
    };
    const signo = input.direccion === "asc" ? 1 : -1;
    const ordenadas = [...filtradas].sort(
      (a, b) => signo * clave(a).localeCompare(clave(b)) || a.id.localeCompare(b.id),
    );

    const inicio = (input.pagina - 1) * input.tamanoPagina;
    return {
      items: ordenadas.slice(inicio, inicio + input.tamanoPagina),
      total: filtradas.length,
      totalAdeudado: Money.sumarTodos(
        filtradas.map((o) => Money.desdeString(o.saldo, "ARS")),
        "ARS",
      ).aStringFiscal(),
      cantidadVencidos: filtradas.filter((o) => o.estado === "vencido").length,
    };
  });
}

/** La posición de IVA mes a mes, para mostrar de dónde sale lo calculado. */
export async function obtenerPosicionIva(actor: Actor) {
  return withTenant(actor.tenantId, async (tx) =>
    (await posicionIva(tx)).map((p) => ({
      periodo: p.periodo,
      debito: p.cargo.aStringFiscal(),
      credito: p.credito.aStringFiscal(),
      saldoAFavorAnterior: p.saldoAFavorAnterior.aStringFiscal(),
      aPagar: p.aPagar.aStringFiscal(),
      saldoAFavorSiguiente: p.saldoAFavorSiguiente.aStringFiscal(),
    })),
  );
}

export async function obtenerImpuesto(actor: Actor, id: string): Promise<Impuesto | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [impuesto] = await tx.select().from(impuestos).where(eq(impuestos.id, id));
    return impuesto ?? null;
  });
}

/** Que el tipo corresponda al régimen fiscal de la empresa. */
async function exigirTipoDelRegimen(tx: TenantTx, tenantId: string, tipo: Impuesto["tipo"]) {
  const { regimenFiscal } = await leerParametros(tx, tenantId);
  const permitidos: readonly string[] = TIPOS_POR_REGIMEN[regimenFiscal];
  if (!permitidos.includes(tipo)) {
    throw new ImpuestoInvalidoError(
      regimenFiscal === "monotributo"
        ? "Un monotributista no liquida IVA ni Ganancias. Revisá el régimen en Parámetros."
        : "Un Responsable Inscripto no paga monotributo. Revisá el régimen en Parámetros.",
    );
  }
}

function aColumnas(input: ImpuestoInput) {
  return {
    tipo: input.tipo,
    periodo: `${input.periodo}-01`,
    concepto: input.concepto ?? null,
    baseImponible: input.baseImponible ?? null,
    alicuota: input.alicuota ?? null,
    importeFijo: input.importeFijo ?? null,
    importePagado: input.importePagado,
    fechaVencimiento: input.fechaVencimiento,
    // Un IVA nuevo es siempre el pago de una posición calculada.
    calculado: input.tipo === "iva",
  };
}

export async function crearImpuesto(actor: Actor, input: ImpuestoInput): Promise<Impuesto> {
  return withTenant(actor.tenantId, async (tx) => {
    await exigirTipoDelRegimen(tx, actor.tenantId, input.tipo);
    const [creado] = await tx
      .insert(impuestos)
      .values({ tenantId: actor.tenantId, ...aColumnas(input) })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear la obligación");
    }
    await auditar(tx, actor, {
      tabla: "impuestos",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarImpuesto(
  actor: Actor,
  { id, datos }: ImpuestoActualizar,
): Promise<Impuesto | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(impuestos).where(eq(impuestos.id, id));
    if (!antes) {
      return null;
    }
    // Un IVA histórico (cargado a mano antes de que se calculara) se sigue
    // pudiendo corregir tal como era; no se convierte en calculado al editarlo.
    const historico = antes.tipo === "iva" && !antes.calculado;
    if (!historico) {
      await exigirTipoDelRegimen(tx, actor.tenantId, datos.tipo);
    }
    const columnas = historico
      ? {
          importePagado: datos.importePagado,
          fechaVencimiento: datos.fechaVencimiento,
          concepto: datos.concepto ?? null,
        }
      : aColumnas(datos);
    const [despues] = await tx
      .update(impuestos)
      .set(columnas)
      .where(eq(impuestos.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "impuestos",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

// --- Retenciones y percepciones de IIBB ---

export async function listarRetenciones(actor: Actor): Promise<Retencion[]> {
  return withTenant(actor.tenantId, (tx) =>
    tx
      .select()
      .from(retencionesIibb)
      .orderBy(desc(retencionesIibb.periodo), desc(retencionesIibb.fecha)),
  );
}

function aColumnasRetencion(input: RetencionInput) {
  return {
    fecha: input.fecha,
    periodo: `${input.periodo}-01`,
    tipo: input.tipo,
    agente: input.agente ?? null,
    comprobante: input.comprobante ?? null,
    importe: input.importe,
  };
}

export async function crearRetencion(actor: Actor, input: RetencionInput): Promise<Retencion> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creada] = await tx
      .insert(retencionesIibb)
      .values({ tenantId: actor.tenantId, ...aColumnasRetencion(input) })
      .returning();
    if (!creada) {
      throw new Error("No se pudo registrar la retención");
    }
    // Reduce un impuesto a pagar: queda en el audit log.
    await auditar(tx, actor, {
      tabla: "retenciones_iibb",
      registroId: creada.id,
      accion: "alta",
      detalle: { despues: creada },
    });
    return creada;
  });
}

export async function actualizarRetencion(
  actor: Actor,
  { id, datos }: RetencionActualizar,
): Promise<Retencion | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(retencionesIibb).where(eq(retencionesIibb.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(retencionesIibb)
      .set(aColumnasRetencion(datos))
      .where(eq(retencionesIibb.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "retenciones_iibb",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

export async function eliminarRetencion(actor: Actor, id: string): Promise<boolean> {
  return withTenant(actor.tenantId, async (tx) => {
    const [borrada] = await tx
      .delete(retencionesIibb)
      .where(eq(retencionesIibb.id, id))
      .returning();
    if (!borrada) {
      return false;
    }
    await auditar(tx, actor, {
      tabla: "retenciones_iibb",
      registroId: id,
      accion: "baja",
      detalle: { antes: borrada },
    });
    return true;
  });
}
