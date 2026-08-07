import { and, gte, lte, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * Rango de fechas para filtrar listados.
 *
 * Las dos puntas son inclusivas: quien pone "hasta el 7" espera ver lo del 7.
 * Las columnas son `date` (sin hora), así que alcanza con comparar contra el
 * texto YYYY-MM-DD y no hay que pelear con zonas horarias.
 */
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

export const rangoFechasSchema = {
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
};

export interface RangoFechas {
  desde?: string | undefined;
  hasta?: string | undefined;
}

/** Condición del rango sobre una columna, o undefined si no filtraron nada. */
export function filtroRango(columna: PgColumn, rango: RangoFechas): SQL | undefined {
  const condiciones: SQL[] = [];
  if (rango.desde) {
    condiciones.push(gte(columna, rango.desde));
  }
  if (rango.hasta) {
    condiciones.push(lte(columna, rango.hasta));
  }
  if (condiciones.length === 0) {
    return undefined;
  }
  return condiciones.length === 1 ? condiciones[0] : and(...condiciones);
}
