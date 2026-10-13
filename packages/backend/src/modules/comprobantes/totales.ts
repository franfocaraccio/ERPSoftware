import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { withTenant } from "../../db/tenant-db.js";
import { conSigno, ventasQueCuentan } from "../_comunes/comprobantes.js";

export interface TotalPorContraparte {
  contraparteId: string;
  nombre: string;
  comprobantes: number;
  neto: string;
  iva: string;
  total: string;
}

/**
 * Cuánto se le facturó a cada cliente entre dos fechas, con y sin IVA. Las
 * notas de crédito restan. Sólo comprobantes que cuentan (enviados o
 * confirmados) y en pesos, igual que el resto de los totales.
 */
export async function totalesDeVentaPorCliente(
  actor: Actor,
  rango: { desde: string; hasta: string },
): Promise<TotalPorContraparte[]> {
  return withTenant(actor.tenantId, (tx) =>
    tx
      .select({
        contraparteId: clientes.id,
        nombre: clientes.razonSocial,
        comprobantes: sql<number>`count(*)::int`,
        neto: sql<string>`sum(${conSigno(comprobantesVenta.neto)})::numeric(14,2)::text`,
        iva: sql<string>`sum(${conSigno(comprobantesVenta.iva)})::numeric(14,2)::text`,
        total: sql<string>`sum(${conSigno(comprobantesVenta.total)})::numeric(14,2)::text`,
      })
      .from(comprobantesVenta)
      .innerJoin(clientes, eq(clientes.id, comprobantesVenta.clienteId))
      .where(
        and(
          ventasQueCuentan(),
          gte(comprobantesVenta.fechaEmision, rango.desde),
          lte(comprobantesVenta.fechaEmision, rango.hasta),
        ),
      )
      .groupBy(clientes.id, clientes.razonSocial)
      .orderBy(sql`sum(${conSigno(comprobantesVenta.total)}) desc`),
  );
}

/** Cuánto se le compró a cada proveedor entre dos fechas (recepción), en pesos. */
export async function totalesDeCompraPorProveedor(
  actor: Actor,
  rango: { desde: string; hasta: string },
): Promise<TotalPorContraparte[]> {
  return withTenant(actor.tenantId, (tx) =>
    tx
      .select({
        contraparteId: proveedores.id,
        nombre: proveedores.razonSocial,
        comprobantes: sql<number>`count(*)::int`,
        neto: sql<string>`sum(${comprobantesCompra.neto})::numeric(14,2)::text`,
        iva: sql<string>`sum(${comprobantesCompra.iva})::numeric(14,2)::text`,
        total: sql<string>`sum(${comprobantesCompra.total})::numeric(14,2)::text`,
      })
      .from(comprobantesCompra)
      .innerJoin(proveedores, eq(proveedores.id, comprobantesCompra.proveedorId))
      .where(
        and(
          eq(comprobantesCompra.moneda, "ARS"),
          gte(comprobantesCompra.fechaRecepcion, rango.desde),
          lte(comprobantesCompra.fechaRecepcion, rango.hasta),
        ),
      )
      .groupBy(proveedores.id, proveedores.razonSocial)
      .orderBy(sql`sum(${comprobantesCompra.total}) desc`),
  );
}
