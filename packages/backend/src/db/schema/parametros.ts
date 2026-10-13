import { integer, numeric, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase } from "./_comunes.js";

// Una fila por tenant. Umbrales que la especificación define como "del cliente".
/** Decide qué impuestos aplican: un monotributista no liquida IVA ni Ganancias. */
export const regimenFiscalEnum = pgEnum("regimen_fiscal", ["responsable_inscripto", "monotributo"]);

export const parametros = pgTable(
  "parametros",
  {
    ...columnasBase,
    // Días de DSO por encima de los cuales un cliente pasa a "en mora".
    umbralMoraDias: integer("umbral_mora_dias").default(60).notNull(),
    // Margen bruto objetivo (%) para el red flag del KPI.
    margenObjetivo: numeric("margen_objetivo", { precision: 5, scale: 2 }),
    // Piso de caja para el semáforo de la proyección a 13 semanas (ARS).
    minimoOperativo: numeric("minimo_operativo", { precision: 14, scale: 2 }),
    // % del total por cobrar (o por pagar) que una sola contraparte puede
    // concentrar antes de que la pantalla lo marque como riesgo. Va con default
    // porque sin umbral no hay semáforo que pintar, a diferencia del margen
    // objetivo y el mínimo operativo, que son nulos a propósito.
    umbralConcentracion: numeric("umbral_concentracion", { precision: 5, scale: 2 })
      .default("20")
      .notNull(),
    regimenFiscal: regimenFiscalEnum("regimen_fiscal").default("responsable_inscripto").notNull(),
    // Día del mes siguiente en que vence el IVA. Depende de la terminación del
    // CUIT; 20 es un valor medio que cada empresa ajusta al suyo.
    diaVencimientoIva: integer("dia_vencimiento_iva").default(20).notNull(),
  },
  (t) => [uniqueIndex("parametros_tenant_unq").on(t.tenantId)],
);
