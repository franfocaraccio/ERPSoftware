import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { columnasBase, monedaEnum } from "./_comunes.js";
import { proveedores } from "./proveedores.js";

// `stock_actual` lo mueven los movimientos de stock y `costo_unitario` es el
// promedio ponderado de las compras (decisiones del 12/10/2026, que
// reemplazaron la carga manual). Estado (Reponer/OK), valorización y rotación
// son derivados: se calculan al leer.
export const productos = pgTable(
  "productos",
  {
    ...columnasBase,
    sku: text("sku").notNull(),
    descripcion: text("descripcion").notNull(),
    categoria: text("categoria"),
    costoUnitario: numeric("costo_unitario", { precision: 14, scale: 2 }),
    precioVenta: numeric("precio_venta", { precision: 14, scale: 2 }),
    moneda: monedaEnum("moneda").default("ARS").notNull(),
    stockActual: numeric("stock_actual", { precision: 14, scale: 3 }).default("0").notNull(),
    stockMinimo: numeric("stock_minimo", { precision: 14, scale: 3 }).default("0").notNull(),
    proveedorPrincipalId: uuid("proveedor_principal_id").references(() => proveedores.id),
  },
  (t) => [
    index("productos_tenant_idx").on(t.tenantId),
    uniqueIndex("productos_tenant_sku_unq").on(t.tenantId, t.sku),
  ],
);

export const tipoMovimientoStockEnum = pgEnum("tipo_movimiento_stock", [
  "inicial",
  "venta",
  "devolucion",
  "compra",
  "ajuste",
]);

/**
 * Cada entrada y salida de un producto. El stock actual es la suma de sus
 * movimientos; `productos.stock_actual` se mantiene al día en la misma
 * transacción, para no recalcularlo en cada lectura.
 *
 * Insert-only: una corrección es un ajuste, no una edición (decisión de
 * Fran del 12/10/2026, que reemplazó la carga manual de stock).
 */
export const movimientosStock = pgTable(
  "movimientos_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    productoId: uuid("producto_id")
      .references(() => productos.id)
      .notNull(),
    fecha: date("fecha").notNull(),
    tipo: tipoMovimientoStockEnum("tipo").notNull(),
    /** Con signo: positivo entra, negativo sale. */
    cantidad: numeric("cantidad", { precision: 14, scale: 3 }).notNull(),
    /** El costo al momento: el de la compra, o el del producto al vender. */
    costoUnitario: numeric("costo_unitario", { precision: 14, scale: 2 }),
    // Sin `.references` en TS para no crear una importación circular con
    // facturación y compras; las FK existen en la base (migración 0018).
    comprobanteVentaId: uuid("comprobante_venta_id"),
    comprobanteCompraId: uuid("comprobante_compra_id"),
    motivo: text("motivo"),
    usuarioId: text("usuario_id"),
    creado: timestamp("creado", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("movimientos_stock_tenant_producto_idx").on(t.tenantId, t.productoId, t.fecha),
    check("movimientos_stock_cantidad_check", sql`${t.cantidad} <> 0`),
  ],
);
