import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import { diasParaCobro, saldoCuenta } from "@erp/core/treasury";
import { and, asc, count, desc, eq, gte, lte, sum } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { cheques, cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import type {
  ChequeActualizar,
  ChequeInput,
  ChequesListar,
  CuentaActualizar,
  CuentaInput,
  MovimientoActualizar,
  MovimientoInput,
  MovimientosListar,
} from "./schema.js";

export type Cuenta = typeof cuentas.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type Cheque = typeof cheques.$inferSelect;

/** El saldo no se persiste: es la suma con signo de los movimientos. */
export interface CuentaConSaldo extends Cuenta {
  saldo: string;
}

export interface ChequeConDerivados extends Cheque {
  libradorNombreEfectivo: string;
  diasParaCobro: number;
}

// "Hoy" es un concepto local: en UTC, a partir de las 21:00 argentinas ya
// sería el día siguiente y los días para cobro saldrían corridos.
const hoyISO = hoyEnArgentina;

// --- Cuentas ---

export async function listarCuentas({ tenantId }: Actor): Promise<{
  items: CuentaConSaldo[];
  saldoConsolidadoArs: string;
}> {
  return withTenant(tenantId, async (tx) => {
    // Un subquery por signo; la resta que define el saldo vive en core.
    const porCuenta = tx
      .select({
        cuentaId: movimientos.cuentaId,
        tipo: movimientos.tipo,
        total: sum(movimientos.importe).as("total"),
      })
      .from(movimientos)
      .groupBy(movimientos.cuentaId, movimientos.tipo)
      .as("por_cuenta");

    const [filasCuentas, totales] = await Promise.all([
      tx.select().from(cuentas).orderBy(asc(cuentas.nombre)),
      tx.select().from(porCuenta),
    ]);

    const items = filasCuentas.map((cuenta) => {
      const ingresos = totales.find((t) => t.cuentaId === cuenta.id && t.tipo === "ingreso");
      const egresos = totales.find((t) => t.cuentaId === cuenta.id && t.tipo === "egreso");
      return {
        ...cuenta,
        saldo: saldoCuenta(
          Money.desdeString(ingresos?.total ?? "0", cuenta.moneda),
          Money.desdeString(egresos?.total ?? "0", cuenta.moneda),
        ).aStringFiscal(),
      };
    });

    // Solo se consolidan las cuentas en pesos: mezclar monedas exigiría
    // una cotización, que no está en alcance.
    const saldoConsolidadoArs = Money.sumarTodos(
      items.filter((c) => c.moneda === "ARS").map((c) => Money.desdeString(c.saldo, "ARS")),
      "ARS",
    ).aStringFiscal();

    return { items, saldoConsolidadoArs };
  });
}

export async function obtenerCuenta(actor: Actor, id: string): Promise<Cuenta | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [cuenta] = await tx.select().from(cuentas).where(eq(cuentas.id, id));
    return cuenta ?? null;
  });
}

export async function crearCuenta(actor: Actor, input: CuentaInput): Promise<Cuenta> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creada] = await tx
      .insert(cuentas)
      .values({ tenantId: actor.tenantId, ...input })
      .returning();
    if (!creada) {
      throw new Error("No se pudo crear la cuenta");
    }
    await auditar(tx, actor, {
      tabla: "cuentas",
      registroId: creada.id,
      accion: "alta",
      detalle: { despues: creada },
    });
    return creada;
  });
}

export async function actualizarCuenta(
  actor: Actor,
  { id, datos }: CuentaActualizar,
): Promise<Cuenta | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(cuentas).where(eq(cuentas.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx.update(cuentas).set(datos).where(eq(cuentas.id, id)).returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "cuentas",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

// --- Movimientos ---

export interface MovimientoConCuenta extends Movimiento {
  cuentaNombre: string;
  cuentaMoneda: "ARS" | "USD";
}

export async function listarMovimientos(
  { tenantId }: Actor,
  input: MovimientosListar,
): Promise<{ items: MovimientoConCuenta[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const condiciones = [];
    if (input.cuentaId) {
      condiciones.push(eq(movimientos.cuentaId, input.cuentaId));
    }
    if (input.desde) {
      condiciones.push(gte(movimientos.fecha, input.desde));
    }
    if (input.hasta) {
      condiciones.push(lte(movimientos.fecha, input.hasta));
    }
    const filtro = condiciones.length > 0 ? and(...condiciones) : undefined;

    const filas = await tx
      .select({ movimiento: movimientos, cuenta: cuentas })
      .from(movimientos)
      .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
      .where(filtro)
      .orderBy(desc(movimientos.fecha), desc(movimientos.createdAt))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const [fila] = await tx.select({ total: count() }).from(movimientos).where(filtro);

    return {
      items: filas.map(({ movimiento, cuenta }) => ({
        ...movimiento,
        cuentaNombre: cuenta.nombre,
        cuentaMoneda: cuenta.moneda,
      })),
      total: fila?.total ?? 0,
    };
  });
}

export async function obtenerMovimiento(actor: Actor, id: string): Promise<Movimiento | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [movimiento] = await tx.select().from(movimientos).where(eq(movimientos.id, id));
    return movimiento ?? null;
  });
}

function aColumnasMovimiento(input: MovimientoInput) {
  return {
    fecha: input.fecha,
    cuentaId: input.cuentaId,
    tipo: input.tipo,
    medioPago: input.medioPago,
    concepto: input.concepto ?? null,
    importe: input.importe,
    clienteId: input.clienteId ?? null,
    proveedorId: input.proveedorId ?? null,
    chequeId: input.chequeId ?? null,
    conciliado: input.conciliado,
  };
}

export async function crearMovimiento(actor: Actor, input: MovimientoInput): Promise<Movimiento> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(movimientos)
      .values({ tenantId: actor.tenantId, ...aColumnasMovimiento(input) })
      .returning();
    if (!creado) {
      throw new Error("No se pudo registrar el movimiento");
    }
    // Impacta saldos: la auditoría es obligatoria.
    await auditar(tx, actor, {
      tabla: "movimientos",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarMovimiento(
  actor: Actor,
  { id, datos }: MovimientoActualizar,
): Promise<Movimiento | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(movimientos).where(eq(movimientos.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(movimientos)
      .set(aColumnasMovimiento(datos))
      .where(eq(movimientos.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "movimientos",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

// --- Cheques ---

export async function listarCheques(
  { tenantId }: Actor,
  input: ChequesListar,
): Promise<{ items: ChequeConDerivados[]; total: number; totalEnCartera: string }> {
  return withTenant(tenantId, async (tx) => {
    const filtro = input.estado ? eq(cheques.estado, input.estado) : undefined;

    const filas = await tx
      .select({ cheque: cheques, libradorCliente: clientes.razonSocial })
      .from(cheques)
      .leftJoin(clientes, eq(clientes.id, cheques.libradorClienteId))
      .where(filtro)
      .orderBy(asc(cheques.fechaPago))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const hoy = hoyISO();
    const items = filas.map(({ cheque, libradorCliente }) => ({
      ...cheque,
      libradorNombreEfectivo: libradorCliente ?? cheque.libradorNombre ?? "—",
      diasParaCobro: diasParaCobro(cheque.fechaPago, hoy),
    }));

    const [fila] = await tx.select({ total: count() }).from(cheques).where(filtro);

    // Los cheques son siempre ARS (decisión de modelado).
    const totalEnCartera = Money.sumarTodos(
      items
        .filter((c) => c.estado === "en_cartera")
        .map((c) => Money.desdeString(c.importe, "ARS")),
      "ARS",
    ).aStringFiscal();

    return { items, total: fila?.total ?? 0, totalEnCartera };
  });
}

export async function obtenerCheque(actor: Actor, id: string): Promise<Cheque | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [cheque] = await tx.select().from(cheques).where(eq(cheques.id, id));
    return cheque ?? null;
  });
}

function aColumnasCheque(input: ChequeInput) {
  return {
    numero: input.numero,
    libradorClienteId: input.libradorClienteId ?? null,
    libradorNombre: input.libradorNombre ?? null,
    banco: input.banco ?? null,
    fechaEmision: input.fechaEmision ?? null,
    fechaPago: input.fechaPago,
    importe: input.importe,
    estado: input.estado,
  };
}

export async function crearCheque(actor: Actor, input: ChequeInput): Promise<Cheque> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(cheques)
      .values({ tenantId: actor.tenantId, ...aColumnasCheque(input) })
      .returning();
    if (!creado) {
      throw new Error("No se pudo registrar el cheque");
    }
    await auditar(tx, actor, {
      tabla: "cheques",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarCheque(
  actor: Actor,
  { id, datos }: ChequeActualizar,
): Promise<Cheque | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(cheques).where(eq(cheques.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(cheques)
      .set(aColumnasCheque(datos))
      .where(eq(cheques.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "cheques",
      registroId: id,
      // Un cambio de estado del cheque es una transición, no una edición común.
      accion: antes.estado === despues.estado ? "modificacion" : "transicion_estado",
      detalle: { antes, despues },
    });
    return despues;
  });
}
