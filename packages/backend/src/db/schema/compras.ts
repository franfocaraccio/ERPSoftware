import { date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { columnasBase, monedaEnum } from "./_comunes.js";
import { letraComprobanteEnum } from "./facturacion.js";
import { proveedores } from "./proveedores.js";

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
  },
  (t) => [
    index("comprobantes_compra_tenant_idx").on(t.tenantId),
    index("comprobantes_compra_tenant_proveedor_idx").on(t.tenantId, t.proveedorId),
    index("comprobantes_compra_tenant_recepcion_idx").on(t.tenantId, t.fechaRecepcion),
  ],
);
