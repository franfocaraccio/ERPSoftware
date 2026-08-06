import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import {
  type EstadoImpuesto,
  estadoImpuesto,
  importeDeterminado,
  saldoImpuesto,
} from "@erp/core/tax";
import { and, count, desc, eq } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { impuestos } from "../../db/schema/impuestos.js";
import { withTenant } from "../../db/tenant-db.js";
import type { ImpuestoActualizar, ImpuestoInput, ImpuestosListar } from "./schema.js";

export type Impuesto = typeof impuestos.$inferSelect;

/** Importe determinado, saldo y estado son derivados: se calculan al leer. */
export interface ImpuestoConDerivados extends Impuesto {
  importeDeterminado: string;
  saldo: string;
  estado: EstadoImpuesto;
}

// "Hoy" es un concepto local: calcularlo en UTC marcaría vencido un impuesto
// un día antes, a partir de las 21:00 hora argentina.
const hoyISO = hoyEnArgentina;

function conDerivados(impuesto: Impuesto, hoy: string): ImpuestoConDerivados {
  // Los impuestos son siempre en ARS (decisión de modelado).
  const base = Money.desdeString(impuesto.baseImponible, "ARS");
  const pagado = Money.desdeString(impuesto.importePagado, "ARS");
  const determinado = importeDeterminado(base, impuesto.alicuota);
  return {
    ...impuesto,
    importeDeterminado: determinado.aStringFiscal(),
    saldo: saldoImpuesto(determinado, pagado).aStringFiscal(),
    estado: estadoImpuesto(determinado, pagado, impuesto.fechaVencimiento, hoy),
  };
}

export async function listarImpuestos(
  { tenantId }: Actor,
  input: ImpuestosListar,
): Promise<{
  items: ImpuestoConDerivados[];
  total: number;
  totalAdeudado: string;
  cantidadVencidos: number;
}> {
  return withTenant(tenantId, async (tx) => {
    const filtro = input.tipo ? eq(impuestos.tipo, input.tipo) : undefined;

    const filas = await tx
      .select()
      .from(impuestos)
      .where(filtro)
      .orderBy(desc(impuestos.fechaVencimiento))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const hoy = hoyISO();
    // El estado depende de la fecha actual, así que el filtro de impagos se
    // aplica sobre los derivados y no en SQL.
    const derivados = filas.map((f) => conDerivados(f, hoy));
    const items = input.soloImpagos ? derivados.filter((i) => i.estado !== "pagado") : derivados;

    const [fila] = await tx.select({ total: count() }).from(impuestos).where(filtro);

    const totalAdeudado = Money.sumarTodos(
      items.map((i) => Money.desdeString(i.saldo, "ARS")),
      "ARS",
    ).aStringFiscal();

    return {
      items,
      total: input.soloImpagos ? items.length : (fila?.total ?? 0),
      totalAdeudado,
      cantidadVencidos: items.filter((i) => i.estado === "vencido").length,
    };
  });
}

export async function obtenerImpuesto(actor: Actor, id: string): Promise<Impuesto | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [impuesto] = await tx.select().from(impuestos).where(eq(impuestos.id, id));
    return impuesto ?? null;
  });
}

function aColumnas(input: ImpuestoInput) {
  return {
    tipo: input.tipo,
    // El período se normaliza al primer día del mes.
    periodo: `${input.periodo}-01`,
    baseImponible: input.baseImponible,
    alicuota: input.alicuota,
    importePagado: input.importePagado,
    fechaVencimiento: input.fechaVencimiento,
  };
}

export async function crearImpuesto(actor: Actor, input: ImpuestoInput): Promise<Impuesto> {
  return withTenant(actor.tenantId, async (tx) => {
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
    const [despues] = await tx
      .update(impuestos)
      .set(aColumnas(datos))
      .where(and(eq(impuestos.id, id)))
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
