import { integer, numeric, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase } from "./_comunes.js";

// Una fila por tenant. Umbrales que la especificación define como "del cliente".
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
  },
  (t) => [uniqueIndex("parametros_tenant_unq").on(t.tenantId)],
);
