import { index, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasBase, monedaEnum } from "./_comunes.js";
import { proveedores } from "./proveedores.js";

// Decisiones Fase 1: stock_actual y costo_unitario son de carga manual.
// Estado (Reponer/OK), valorización y rotación son derivados: se calculan al leer.
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
