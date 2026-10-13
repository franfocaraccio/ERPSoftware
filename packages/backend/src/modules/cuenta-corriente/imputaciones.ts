import { validarImputaciones } from "@erp/core/balances";
import { Money } from "@erp/core/money";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, imputaciones, type movimientos } from "../../db/schema/tesoreria.js";
import type { TenantTx } from "../../db/tenant-db.js";
import { ESTADOS_QUE_DEBEN } from "../_comunes/comprobantes.js";
import { type Lado, saldosCuentaCorriente } from "./saldos.js";

type Movimiento = typeof movimientos.$inferSelect;

export interface LineaInput {
  comprobanteId: string;
  importe: string;
}

export interface Imputacion {
  comprobanteId: string;
  importe: string;
}

export class ImputacionInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ImputacionInvalidaError";
  }
}

const ars = (v: string | null | undefined) => Money.desdeString(v ?? "0", "ARS");

/** Un cobro imputa ventas de su cliente; un pago, compras de su proveedor. */
function ladoDe(m: Movimiento): { lado: Lado; contraparteId: string } | null {
  if (m.tipo === "ingreso" && m.clienteId) {
    return { lado: "ventas", contraparteId: m.clienteId };
  }
  if (m.tipo === "egreso" && m.proveedorId) {
    return { lado: "compras", contraparteId: m.proveedorId };
  }
  return null;
}

interface ComprobanteImputable {
  id: string;
  contraparteId: string;
  moneda: string;
  total: string;
  cuenta: boolean;
}

async function leerComprobantes(
  tx: TenantTx,
  lado: Lado,
  ids: readonly string[],
): Promise<ComprobanteImputable[]> {
  if (ids.length === 0) {
    return [];
  }
  if (lado === "ventas") {
    return tx
      .select({
        id: comprobantesVenta.id,
        contraparteId: comprobantesVenta.clienteId,
        moneda: comprobantesVenta.moneda,
        total: comprobantesVenta.total,
        // Una nota de crédito no se cobra, y un borrador o un rechazado no son
        // deuda: ninguno se puede imputar.
        cuenta: sql<boolean>`${comprobantesVenta.clase} <> 'nota_credito' and ${inArray(comprobantesVenta.estado, [...ESTADOS_QUE_DEBEN])}`,
      })
      .from(comprobantesVenta)
      .where(inArray(comprobantesVenta.id, [...ids]));
  }
  return tx
    .select({
      id: comprobantesCompra.id,
      contraparteId: comprobantesCompra.proveedorId,
      moneda: comprobantesCompra.moneda,
      total: comprobantesCompra.total,
      cuenta: sql<boolean>`true`,
    })
    .from(comprobantesCompra)
    .where(inArray(comprobantesCompra.id, [...ids]));
}

/** Lo imputado a cada comprobante por movimientos distintos de `excluir`. */
async function imputadoPorOtros(
  tx: TenantTx,
  lado: Lado,
  ids: readonly string[],
  excluir: string | null,
): Promise<Map<string, Money>> {
  if (ids.length === 0) {
    return new Map();
  }
  const col =
    lado === "ventas" ? imputaciones.comprobanteVentaId : imputaciones.comprobanteCompraId;
  const filas = await tx
    .select({ id: sql<string>`${col}`, total: sql<string>`sum(${imputaciones.importe})` })
    .from(imputaciones)
    .where(
      and(inArray(col, [...ids]), excluir ? ne(imputaciones.movimientoId, excluir) : undefined),
    )
    .groupBy(col);
  return new Map(filas.map((f) => [f.id, ars(f.total)]));
}

/**
 * Reemplaza las imputaciones de un movimiento por `lineas`.
 *
 * Valida que cada comprobante sea de la contraparte del movimiento, esté en
 * su moneda y cuente como deuda, y que no se impute de más (`validarImputaciones`,
 * en core). Lo no imputado queda a cuenta.
 */
export async function guardarImputaciones(
  tx: TenantTx,
  movimiento: Movimiento,
  lineas: readonly LineaInput[],
): Promise<Imputacion[]> {
  await tx.delete(imputaciones).where(eq(imputaciones.movimientoId, movimiento.id));
  if (lineas.length === 0) {
    return [];
  }

  const lado = ladoDe(movimiento);
  if (!lado) {
    throw new ImputacionInvalidaError(
      movimiento.tipo === "ingreso"
        ? "Para imputar un cobro, elegí el cliente que pagó."
        : "Para imputar un pago, elegí el proveedor al que se le pagó.",
    );
  }

  const ids = lineas.map((l) => l.comprobanteId);
  const [cuenta] = await tx
    .select({ moneda: cuentas.moneda })
    .from(cuentas)
    .where(eq(cuentas.id, movimiento.cuentaId));
  const encontrados = new Map((await leerComprobantes(tx, lado.lado, ids)).map((c) => [c.id, c]));
  for (const id of ids) {
    const c = encontrados.get(id);
    // RLS ya esconde los de otra empresa: llegan como "no encontrado".
    if (!c || c.contraparteId !== lado.contraparteId) {
      throw new ImputacionInvalidaError("El comprobante no es de esta contraparte.");
    }
    if (!c.cuenta) {
      throw new ImputacionInvalidaError(
        "Sólo se pueden imputar comprobantes enviados o aprobados, y no notas de crédito.",
      );
    }
    if (c.moneda !== cuenta?.moneda) {
      throw new ImputacionInvalidaError(
        "El comprobante está en otra moneda que la cuenta del movimiento.",
      );
    }
  }

  const otros = await imputadoPorOtros(tx, lado.lado, ids, movimiento.id);
  const motivo = validarImputaciones(
    ars(movimiento.importe),
    lineas.map((l) => {
      const total = ars(encontrados.get(l.comprobanteId)?.total);
      return {
        id: l.comprobanteId,
        importe: ars(l.importe),
        disponible: total.restar(otros.get(l.comprobanteId) ?? Money.cero("ARS")),
      };
    }),
  );
  if (motivo) {
    throw new ImputacionInvalidaError(motivo);
  }

  await tx.insert(imputaciones).values(
    lineas.map((l) => ({
      tenantId: movimiento.tenantId,
      movimientoId: movimiento.id,
      comprobanteVentaId: lado.lado === "ventas" ? l.comprobanteId : null,
      comprobanteCompraId: lado.lado === "compras" ? l.comprobanteId : null,
      importe: l.importe,
    })),
  );
  return lineas.map((l) => ({ comprobanteId: l.comprobanteId, importe: l.importe }));
}

export async function imputacionesDe(tx: TenantTx, movimientoId: string): Promise<Imputacion[]> {
  const filas = await tx
    .select({
      venta: imputaciones.comprobanteVentaId,
      compra: imputaciones.comprobanteCompraId,
      importe: imputaciones.importe,
    })
    .from(imputaciones)
    .where(eq(imputaciones.movimientoId, movimientoId));
  return filas.map((f) => ({ comprobanteId: f.venta ?? f.compra ?? "", importe: f.importe }));
}

export interface ComprobanteAbierto {
  id: string;
  descripcion: string;
  fecha: string;
  vencimiento: string;
  total: string;
  /** Lo que queda por cobrar, con todo lo cobrado aplicado (imputado y FIFO). */
  pendiente: string;
  /** Lo máximo que este movimiento le puede imputar. */
  disponible: string;
  /** Lo que este movimiento ya le tiene imputado (al editarlo). */
  imputadoAca: string;
}

/**
 * Los comprobantes de una contraparte que un movimiento puede imputar: los que
 * tienen algo pendiente y los que este movimiento ya imputa.
 */
export async function comprobantesAbiertos(
  tx: TenantTx,
  lado: Lado,
  contraparteId: string,
  movimientoId: string | null,
): Promise<ComprobanteAbierto[]> {
  const cc = await saldosCuentaCorriente(tx, lado, { contraparteIds: [contraparteId] });
  const ids = cc.comprobantes.map((c) => c.id);
  const otros = await imputadoPorOtros(tx, lado, ids, movimientoId);
  const aca = new Map(
    movimientoId
      ? (await imputacionesDe(tx, movimientoId)).map((i) => [i.comprobanteId, ars(i.importe)])
      : [],
  );

  const datos = new Map(
    (lado === "ventas"
      ? await tx
          .select({
            id: comprobantesVenta.id,
            descripcion: sql<string>`${comprobantesVenta.letra} || ' ' || lpad(${comprobantesVenta.puntoVenta}::text, 4, '0') || '-' || coalesce(lpad(${comprobantesVenta.numero}::text, 8, '0'), 's/n')`,
            fecha: comprobantesVenta.fechaEmision,
          })
          .from(comprobantesVenta)
          .where(ids.length > 0 ? inArray(comprobantesVenta.id, ids) : sql`false`)
      : await tx
          .select({
            id: comprobantesCompra.id,
            descripcion: sql<string>`coalesce(${comprobantesCompra.numeroCompleto}, ${comprobantesCompra.concepto}, 'Compra')`,
            fecha: comprobantesCompra.fechaRecepcion,
          })
          .from(comprobantesCompra)
          .where(ids.length > 0 ? inArray(comprobantesCompra.id, ids) : sql`false`)
    ).map((d) => [d.id, d]),
  );

  return cc.comprobantes
    .filter((c) => c.pendiente.esPositivo() || aca.has(c.id))
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
    .map((c) => ({
      id: c.id,
      descripcion: datos.get(c.id)?.descripcion ?? "",
      fecha: datos.get(c.id)?.fecha ?? "",
      vencimiento: c.vencimiento,
      total: c.total.aStringFiscal(),
      pendiente: c.pendiente.aStringFiscal(),
      disponible: c.total.restar(otros.get(c.id) ?? Money.cero("ARS")).aStringFiscal(),
      imputadoAca: (aca.get(c.id) ?? Money.cero("ARS")).aStringFiscal(),
    }));
}
