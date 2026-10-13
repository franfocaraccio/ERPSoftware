import {
  type EstadoCobro,
  estadoCobro,
  type SaldoComprobante,
  saldosPorComprobante,
} from "@erp/core/balances";
import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import { and, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, imputaciones, movimientos } from "../../db/schema/tesoreria.js";
import type { TenantTx } from "../../db/tenant-db.js";
import { ventasQueCuentan } from "../_comunes/comprobantes.js";

export type Lado = "ventas" | "compras";

const ARS = "ARS" as const;
const ars = (v: string | null | undefined) => Money.desdeString(v ?? "0", ARS);

export interface SaldoConContraparte extends SaldoComprobante {
  contraparteId: string;
  estado: EstadoCobro;
}

export interface SaldosCuentaCorriente {
  /** Un registro por comprobante (no notas de crédito), cancelados incluidos. */
  comprobantes: SaldoConContraparte[];
  /** Crédito sin aplicar de cada contraparte: un pago a cuenta. */
  aCuenta: Map<string, Money>;
}

function sumarEn(mapa: Map<string, Money>, clave: string | null, importe: Money): void {
  if (clave) {
    mapa.set(clave, (mapa.get(clave) ?? Money.cero(ARS)).sumar(importe));
  }
}

/**
 * El saldo de cada comprobante en pesos, con lo imputado explícitamente y el
 * resto del crédito de cada contraparte aplicado FIFO (`saldosPorComprobante`,
 * en core).
 *
 * Es **la** cuenta corriente: el panel, Clientes, Proveedores, las fichas y las
 * listas de comprobantes leen de acá. Antes cada uno hacía su propia versión y
 * daban números distintos para la misma deuda.
 *
 * El crédito de una contraparte es lo que pagó y no imputó, más (en ventas)
 * sus notas de crédito. `creditoExtra` agrega lo que quien llama quiera contar
 * como cancelación sin ser un pago: la proyección de caja pasa los cheques en
 * cartera, que cubren facturas aunque la plata todavía no llegó.
 */
export async function saldosCuentaCorriente(
  tx: TenantTx,
  lado: Lado,
  opciones: { contraparteIds?: readonly string[]; creditoExtra?: ReadonlyMap<string, Money> } = {},
): Promise<SaldosCuentaCorriente> {
  const { contraparteIds, creditoExtra } = opciones;
  if (contraparteIds && contraparteIds.length === 0) {
    return { comprobantes: [], aCuenta: new Map() };
  }

  const esVenta = lado === "ventas";
  const contraparteMov = esVenta ? movimientos.clienteId : movimientos.proveedorId;

  // --- Comprobantes ---
  const filas = esVenta
    ? await tx
        .select({
          id: comprobantesVenta.id,
          contraparteId: comprobantesVenta.clienteId,
          esNotaCredito: sql<boolean>`${comprobantesVenta.clase} = 'nota_credito'`,
          vencimiento: sql<string>`to_char(${comprobantesVenta.fechaEmision} + ${comprobantesVenta.condicionVentaDias} * interval '1 day', 'YYYY-MM-DD')`,
          total: comprobantesVenta.total,
        })
        .from(comprobantesVenta)
        .where(
          and(
            ventasQueCuentan(),
            contraparteIds ? inArray(comprobantesVenta.clienteId, [...contraparteIds]) : undefined,
          ),
        )
    : await tx
        .select({
          id: comprobantesCompra.id,
          contraparteId: comprobantesCompra.proveedorId,
          esNotaCredito: sql<boolean>`false`,
          vencimiento: sql<string>`to_char(${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day', 'YYYY-MM-DD')`,
          total: comprobantesCompra.total,
        })
        .from(comprobantesCompra)
        .where(
          and(
            eq(comprobantesCompra.moneda, ARS),
            contraparteIds
              ? inArray(comprobantesCompra.proveedorId, [...contraparteIds])
              : undefined,
          ),
        );

  // --- Lo pagado por cada contraparte, en pesos ---
  const filtroContraparte: SQL | undefined = contraparteIds
    ? inArray(contraparteMov, [...contraparteIds])
    : isNotNull(contraparteMov);
  const pagos = await tx
    .select({
      contraparteId: sql<string>`${contraparteMov}`,
      total: sql<string>`sum(${movimientos.importe})`,
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(
      and(
        eq(movimientos.tipo, esVenta ? "ingreso" : "egreso"),
        eq(cuentas.moneda, ARS),
        filtroContraparte,
      ),
    )
    .groupBy(contraparteMov);

  // --- Lo imputado: por comprobante y, para descontarlo del crédito libre, por
  // contraparte del movimiento ---
  const colComprobante = esVenta
    ? imputaciones.comprobanteVentaId
    : imputaciones.comprobanteCompraId;
  const imputadas = await tx
    .select({
      comprobanteId: sql<string>`${colComprobante}`,
      contraparteId: sql<string>`${contraparteMov}`,
      total: sql<string>`sum(${imputaciones.importe})`,
    })
    .from(imputaciones)
    .innerJoin(movimientos, eq(movimientos.id, imputaciones.movimientoId))
    .where(and(isNotNull(colComprobante), filtroContraparte))
    .groupBy(colComprobante, contraparteMov);

  const imputadoPorComprobante = new Map<string, Money>();
  const credito = new Map<string, Money>();
  for (const p of pagos) {
    sumarEn(credito, p.contraparteId, ars(p.total));
  }
  // Lo imputado a un comprobante que ya no cuenta (se rechazó después de
  // cobrarlo, por ejemplo) no se pierde: vuelve a ser crédito libre.
  const vigentes = new Set(filas.map((f) => f.id));
  for (const i of imputadas) {
    if (vigentes.has(i.comprobanteId)) {
      sumarEn(imputadoPorComprobante, i.comprobanteId, ars(i.total));
      sumarEn(credito, i.contraparteId, ars(i.total).negar());
    }
  }
  for (const f of filas.filter((f) => f.esNotaCredito)) {
    sumarEn(credito, f.contraparteId, ars(f.total));
  }
  for (const [contraparte, extra] of creditoExtra ?? []) {
    sumarEn(credito, contraparte, extra);
  }

  // --- Saldos por contraparte, en core ---
  const hoy = hoyEnArgentina();
  const porContraparte = new Map<string, typeof filas>();
  for (const f of filas.filter((f) => !f.esNotaCredito)) {
    porContraparte.set(f.contraparteId, [...(porContraparte.get(f.contraparteId) ?? []), f]);
  }

  const comprobantes: SaldoConContraparte[] = [];
  const aCuenta = new Map<string, Money>();
  const contrapartes = new Set([...porContraparte.keys(), ...credito.keys()]);
  for (const contraparte of contrapartes) {
    const propios = porContraparte.get(contraparte) ?? [];
    const disponible = credito.get(contraparte) ?? Money.cero(ARS);
    const r = saldosPorComprobante(
      propios.map((f) => ({ id: f.id, vencimiento: f.vencimiento, total: ars(f.total) })),
      imputadoPorComprobante,
      // Un crédito negativo sería imputar más de lo pagado: el service de
      // tesorería no lo permite, pero una edición vieja podría dejarlo así.
      disponible.esNegativo() ? Money.cero(ARS) : disponible,
    );
    for (const c of r.comprobantes) {
      comprobantes.push({
        ...c,
        contraparteId: contraparte,
        estado: estadoCobro(c.total, c.pendiente, c.vencimiento, hoy),
      });
    }
    if (r.aCuenta.esPositivo()) {
      aCuenta.set(contraparte, r.aCuenta);
    }
  }

  return { comprobantes, aCuenta };
}

/** El primer vencimiento impago de cada contraparte (puede estar en el pasado). */
export function primerVencimientoImpago(
  saldos: readonly SaldoConContraparte[],
): Map<string, string> {
  const resultado = new Map<string, string>();
  for (const s of saldos) {
    if (!s.pendiente.esPositivo()) {
      continue;
    }
    const actual = resultado.get(s.contraparteId);
    if (!actual || s.vencimiento < actual) {
      resultado.set(s.contraparteId, s.vencimiento);
    }
  }
  return resultado;
}
