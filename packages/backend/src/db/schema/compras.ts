import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { columnasBase, monedaEnum } from "./_comunes.js";
import { letraComprobanteEnum } from "./facturacion.js";
import { proveedores } from "./proveedores.js";
import { productos } from "./stock.js";

// Comprobantes recibidos de proveedores. Tabla propia, separada de comprobantes_venta:
// una compra es un documento recibido (sin ciclo de emisión ARCA ni CAE propio).
// Saldo a pagar y fecha de vencimiento (recepción + condición de pago) son derivados.
export const comprobantesCompra = pgTable(
  "comprobantes_compra",
  {
    ...columnasBase,
    proveedorId: uuid("proveedor_id")
      .references(() => proveedores.id)
      .notNull(),
    letra: letraComprobanteEnum("letra"),
    numeroCompleto: text("numero_completo"), // ej: "0001-00001234", tal como figura en el papel
    fechaEmision: date("fecha_emision"),
    fechaRecepcion: date("fecha_recepcion").notNull(),
    // Heredada del proveedor al cargar, editable por comprobante (alimenta proyección de pagos).
    condicionPagoDias: integer("condicion_pago_dias").default(0).notNull(),
    concepto: text("concepto"),
    moneda: monedaEnum("moneda").default("ARS").notNull(),
    neto: numeric("neto", { precision: 14, scale: 2 }).default("0").notNull(),
    iva: numeric("iva", { precision: 14, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    adjuntoPath: text("adjunto_path"), // comprobante escaneado en Supabase Storage
    // Null = mercadería para stock: entra en resultados como costo cuando se
    // vende. Con categoría = un gasto (un flete, un honorario), que entra en
    // resultados por su neto en el mes de recepción.
    categoriaId: uuid("categoria_id"),
  },
  (t) => [
    index("comprobantes_compra_tenant_idx").on(t.tenantId),
    index("comprobantes_compra_tenant_proveedor_idx").on(t.tenantId, t.proveedorId),
    index("comprobantes_compra_tenant_recepcion_idx").on(t.tenantId, t.fechaRecepcion),
  ],
);

/**
 * Lo que trajo una compra de mercadería, producto por producto. Es lo que
 * suma stock y recalcula el costo promedio ponderado. Una compra de servicios
 * (con categoría de gasto) no tiene ítems.
 */
export const itemsComprobanteCompra = pgTable(
  "items_comprobante_compra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    comprobanteId: uuid("comprobante_id")
      .references(() => comprobantesCompra.id, { onDelete: "cascade" })
      .notNull(),
    productoId: uuid("producto_id")
      .references(() => productos.id)
      .notNull(),
    descripcion: text("descripcion").notNull(),
    cantidad: numeric("cantidad", { precision: 14, scale: 3 }).notNull(),
    /** Neto, sin IVA: es lo que cuesta el producto. */
    costoUnitario: numeric("costo_unitario", { precision: 14, scale: 2 }).notNull(),
    orden: integer("orden").default(0).notNull(),
  },
  (t) => [
    index("items_compra_tenant_comprobante_idx").on(t.tenantId, t.comprobanteId),
    check("items_compra_cantidad_check", sql`${t.cantidad} > 0`),
  ],
);
