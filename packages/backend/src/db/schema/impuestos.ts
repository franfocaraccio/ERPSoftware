import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { columnasBase } from "./_comunes.js";

export const tipoImpuestoEnum = pgEnum("tipo_impuesto", [
  "iva",
  "iibb",
  "ganancias",
  "monotributo",
  "otros",
]);

// Siempre en ARS (decisión de modelado). Un único importe_pagado por registro.
// Derivados calculados al leer: importe_determinado = base × alícuota;
// estado = Pagado si pagado ≥ determinado, Vencido si hoy > vencimiento, sino Pendiente.
export const impuestos = pgTable(
  "impuestos",
  {
    ...columnasBase,
    tipo: tipoImpuestoEnum("tipo").notNull(),
    periodo: date("periodo").notNull(), // primer día del mes del período
    baseImponible: numeric("base_imponible", { precision: 14, scale: 2 }).notNull(),
    alicuota: numeric("alicuota", { precision: 6, scale: 3 }).notNull(), // porcentaje, ej 21.000
    importePagado: numeric("importe_pagado", { precision: 14, scale: 2 }).default("0").notNull(),
    fechaVencimiento: date("fecha_vencimiento").notNull(),
    comprobantePagoPath: text("comprobante_pago_path"), // adjunto en Supabase Storage
  },
  (t) => [
    index("impuestos_tenant_idx").on(t.tenantId),
    index("impuestos_tenant_tipo_periodo_idx").on(t.tenantId, t.tipo, t.periodo),
    index("impuestos_tenant_vencimiento_idx").on(t.tenantId, t.fechaVencimiento),
    check("impuestos_alicuota_check", sql`${t.alicuota} >= 0`),
  ],
);
