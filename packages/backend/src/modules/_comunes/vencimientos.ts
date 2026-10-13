import { imputarFIFO } from "@erp/core/balances";
import { Money } from "@erp/core/money";
import { and, eq, inArray, sql } from "drizzle-orm";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import type { TenantTx } from "../../db/tenant-db.js";
import { ventasQueCuentan } from "./comprobantes.js";

const ars = (v: string | null) => Money.desdeString(v ?? "0", "ARS");

/**
 * El vencimiento de la deuda impaga más vieja de cada contraparte, con lo
 * pagado aplicado FIFO. Puede estar en el pasado: eso es lo que hay que ver.
 *
 * Antes se mostraba el vencimiento futuro más cercano, que escondía justo lo
 * importante —un proveedor con todo vencido aparecía vacío— y además ignoraba
 * los pagos: una factura ya pagada seguía apareciendo como próxima a vencer.
 */
function primerImpago(
  comprobantes: readonly { id: string; contraparte: string; vencimiento: string; importe: Money }[],
  creditos: ReadonlyMap<string, Money>,
): Map<string, string> {
  const porContraparte = new Map<string, (typeof comprobantes)[number][]>();
  for (const c of comprobantes) {
    porContraparte.set(c.contraparte, [...(porContraparte.get(c.contraparte) ?? []), c]);
  }
  const resultado = new Map<string, string>();
  for (const [contraparte, propios] of porContraparte) {
    const { pendientes } = imputarFIFO(propios, creditos.get(contraparte) ?? Money.cero("ARS"));
    if (pendientes[0]) {
      resultado.set(contraparte, pendientes[0].vencimiento);
    }
  }
  return resultado;
}

async function pagadoPor(
  tx: TenantTx,
  tipo: "ingreso" | "egreso",
  columna: typeof movimientos.clienteId | typeof movimientos.proveedorId,
  ids: readonly string[],
): Promise<Map<string, Money>> {
  const filas = await tx
    .select({ id: sql<string>`${columna}`, total: sql<string>`sum(${movimientos.importe})` })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(and(eq(movimientos.tipo, tipo), eq(cuentas.moneda, "ARS"), inArray(columna, [...ids])))
    .groupBy(columna);
  return new Map(filas.map((f) => [f.id, ars(f.total)]));
}

/** Para Clientes: las notas de crédito cancelan deuda como un cobro. */
export async function vencimientoImpagoClientes(
  tx: TenantTx,
  clienteIds: readonly string[],
): Promise<Map<string, string>> {
  if (clienteIds.length === 0) {
    return new Map();
  }
  const filas = await tx
    .select({
      id: comprobantesVenta.id,
      clienteId: comprobantesVenta.clienteId,
      clase: comprobantesVenta.clase,
      vencimiento: sql<string>`to_char(${comprobantesVenta.fechaEmision} + ${comprobantesVenta.condicionVentaDias} * interval '1 day', 'YYYY-MM-DD')`,
      total: comprobantesVenta.total,
    })
    .from(comprobantesVenta)
    .where(and(ventasQueCuentan(), inArray(comprobantesVenta.clienteId, [...clienteIds])));

  const creditos = await pagadoPor(tx, "ingreso", movimientos.clienteId, clienteIds);
  for (const nc of filas.filter((f) => f.clase === "nota_credito")) {
    creditos.set(
      nc.clienteId,
      (creditos.get(nc.clienteId) ?? Money.cero("ARS")).sumar(ars(nc.total)),
    );
  }

  return primerImpago(
    filas
      .filter((f) => f.clase !== "nota_credito")
      .map((f) => ({
        id: f.id,
        contraparte: f.clienteId,
        vencimiento: f.vencimiento,
        importe: ars(f.total),
      })),
    creditos,
  );
}

export async function vencimientoImpagoProveedores(
  tx: TenantTx,
  proveedorIds: readonly string[],
): Promise<Map<string, string>> {
  if (proveedorIds.length === 0) {
    return new Map();
  }
  const filas = await tx
    .select({
      id: comprobantesCompra.id,
      proveedorId: comprobantesCompra.proveedorId,
      vencimiento: sql<string>`to_char(${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day', 'YYYY-MM-DD')`,
      total: comprobantesCompra.total,
    })
    .from(comprobantesCompra)
    .where(
      and(
        eq(comprobantesCompra.moneda, "ARS"),
        inArray(comprobantesCompra.proveedorId, [...proveedorIds]),
      ),
    );

  return primerImpago(
    filas.map((f) => ({
      id: f.id,
      contraparte: f.proveedorId,
      vencimiento: f.vencimiento,
      importe: ars(f.total),
    })),
    await pagadoPor(tx, "egreso", movimientos.proveedorId, proveedorIds),
  );
}
