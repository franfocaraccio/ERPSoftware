import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
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
    // Base y alícuota para lo que se calcula así (IIBB, IVA histórico). Nulas
    // cuando el importe es fijo.
    baseImponible: numeric("base_imponible", { precision: 14, scale: 2 }),
    alicuota: numeric("alicuota", { precision: 6, scale: 3 }), // porcentaje, ej 21.000
    // Importe determinado directo: la cuota de monotributo, un anticipo de
    // Ganancias. Lo informa ARCA o el contador; el sistema no lo estima.
    importeFijo: numeric("importe_fijo", { precision: 14, scale: 2 }),
    // Qué es dentro del período: "Anticipo 3", "Saldo DDJJ".
    concepto: text("concepto"),
    // El pago de una posición de IVA calculada por el sistema: lo determinado
    // no sale de esta fila sino de los comprobantes del período.
    calculado: boolean("calculado").default(false).notNull(),
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

export const tipoRetencionEnum = pgEnum("tipo_retencion_iibb", [
  "retencion",
  "percepcion",
  "sircreb",
]);

/**
 * Retenciones y percepciones de Ingresos Brutos que le hicieron a la empresa,
 * incluido SIRCREB (lo que el banco retiene sobre las acreditaciones). Son
 * pagos a cuenta: restan del IIBB del período.
 *
 * Sólo IIBB por decisión de Fran del 12/10/2026; las de IVA y Ganancias no.
 */
export const retencionesIibb = pgTable(
  "retenciones_iibb",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    fecha: date("fecha").notNull(),
    // Primer día del mes al que se imputa.
    periodo: date("periodo").notNull(),
    tipo: tipoRetencionEnum("tipo").notNull(),
    agente: text("agente"),
    comprobante: text("comprobante"),
    importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    index("retenciones_iibb_tenant_periodo_idx").on(t.tenantId, t.periodo),
    check("retenciones_iibb_importe_check", sql`${t.importe} > 0`),
  ],
);
