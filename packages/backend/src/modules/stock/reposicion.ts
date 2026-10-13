import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import { sugerenciaCompra } from "@erp/core/stock";
import { and, desc, eq, gt, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { movimientosStock, productos } from "../../db/schema/stock.js";
import { withTenant } from "../../db/tenant-db.js";

export interface FilaReposicion {
  productoId: string;
  sku: string;
  descripcion: string;
  proveedorId: string | null;
  proveedor: string | null;
  moneda: "ARS" | "USD";
  stock: string;
  minimo: string;
  /** Unidades vendidas en los últimos 30 días, neto de devoluciones. */
  salidas30Dias: string;
  /** El costo de la última compra; si no hubo, el costo promedio del producto. */
  costoReposicion: string | null;
  origenCosto: "ultima_compra" | "promedio" | null;
  cantidad: string;
  importe: string | null;
}

/**
 * Qué comprar para los productos marcados "Reponer": cuánto (la regla está en
 * `sugerenciaCompra`, en core) y a qué costo.
 *
 * El costo de reposición es el de la **última compra**, no el promedio
 * ponderado: el promedio sirve para valuar lo que hay, pero lo que se va a
 * pagar al reponer se parece más al último precio.
 */
export interface PedidoSugerido {
  proveedorId: string | null;
  proveedor: string | null;
  items: FilaReposicion[];
  /** Suma de los importes; null si algún ítem no tiene costo o mezcla monedas. */
  total: string | null;
}

/** Las sugerencias agrupadas por proveedor: un pedido por proveedor. */
export function agruparPorProveedor(filas: FilaReposicion[]): PedidoSugerido[] {
  const grupos = new Map<string, PedidoSugerido>();
  for (const f of filas) {
    const clave = f.proveedorId ?? "";
    const grupo = grupos.get(clave) ?? {
      proveedorId: f.proveedorId,
      proveedor: f.proveedor,
      items: [],
      total: null,
    };
    grupo.items.push(f);
    grupos.set(clave, grupo);
  }
  for (const g of grupos.values()) {
    const moneda = g.items[0]?.moneda ?? "ARS";
    const valuables = g.items.every((i) => i.importe !== null && i.moneda === moneda);
    g.total = valuables
      ? g.items
          .reduce(
            (acc, i) => acc.sumar(Money.desdeString(i.importe ?? "0", moneda)),
            Money.cero(moneda),
          )
          .aStringFiscal()
      : null;
  }
  // Los productos sin proveedor, al final.
  return [...grupos.values()].sort((a, b) =>
    a.proveedor === null ? 1 : b.proveedor === null ? -1 : a.proveedor.localeCompare(b.proveedor),
  );
}

export async function sugerenciasDeCompra(
  actor: Actor,
  hoy: string = hoyEnArgentina(),
): Promise<FilaReposicion[]> {
  return withTenant(actor.tenantId, async (tx) => {
    const aReponer = await tx
      .select({ producto: productos, proveedor: proveedores.razonSocial })
      .from(productos)
      .leftJoin(proveedores, eq(proveedores.id, productos.proveedorPrincipalId))
      .where(and(gt(productos.stockMinimo, "0"), lte(productos.stockActual, productos.stockMinimo)))
      .orderBy(proveedores.razonSocial, productos.sku);
    if (aReponer.length === 0) {
      return [];
    }
    const ids = aReponer.map((f) => f.producto.id);

    const desde = new Date(`${hoy}T00:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - 30);
    // Las ventas salen con signo negativo y las devoluciones entran positivas:
    // la suma con el signo invertido es lo que salió neto.
    const salidas = await tx
      .select({
        productoId: movimientosStock.productoId,
        cantidad: sql<string>`coalesce(-sum(${movimientosStock.cantidad}), 0)`,
      })
      .from(movimientosStock)
      .where(
        and(
          inArray(movimientosStock.productoId, ids),
          inArray(movimientosStock.tipo, ["venta", "devolucion"]),
          gte(movimientosStock.fecha, desde.toISOString().slice(0, 10)),
        ),
      )
      .groupBy(movimientosStock.productoId);
    const salidasPor = new Map(salidas.map((s) => [s.productoId, s.cantidad]));

    const ultimas = await tx
      .selectDistinctOn([movimientosStock.productoId], {
        productoId: movimientosStock.productoId,
        costo: movimientosStock.costoUnitario,
      })
      .from(movimientosStock)
      .where(
        and(
          inArray(movimientosStock.productoId, ids),
          eq(movimientosStock.tipo, "compra"),
          isNotNull(movimientosStock.costoUnitario),
        ),
      )
      .orderBy(
        movimientosStock.productoId,
        desc(movimientosStock.fecha),
        desc(movimientosStock.creado),
      );
    const ultimaCompra = new Map(ultimas.map((u) => [u.productoId, u.costo]));

    return aReponer.flatMap(({ producto, proveedor }) => {
      const deCompra = ultimaCompra.get(producto.id) ?? null;
      const costo = deCompra ?? producto.costoUnitario;
      const salidas30Dias = salidasPor.get(producto.id) ?? "0";
      const sugerencia = sugerenciaCompra(
        { stock: producto.stockActual, minimo: producto.stockMinimo, salidas30Dias },
        costo ? Money.desdeString(costo, producto.moneda) : null,
      );
      if (!sugerencia) {
        return [];
      }
      return [
        {
          productoId: producto.id,
          sku: producto.sku,
          descripcion: producto.descripcion,
          proveedorId: producto.proveedorPrincipalId,
          proveedor,
          moneda: producto.moneda,
          stock: producto.stockActual,
          minimo: producto.stockMinimo,
          salidas30Dias,
          costoReposicion: costo,
          origenCosto: deCompra ? "ultima_compra" : costo ? "promedio" : null,
          cantidad: sugerencia.cantidad,
          importe: sugerencia.importe?.aStringFiscal() ?? null,
        },
      ];
    });
  });
}
