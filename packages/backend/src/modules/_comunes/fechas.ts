import { and, gte, lt, lte, type SQL } from "drizzle-orm";
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

/**
 * Argentina no tiene horario de verano, así que un offset fijo alcanza y evita
 * arrastrar una librería de zonas horarias. Cuando `core/dates` tenga manejo
 * de zonas, esto se muda ahí.
 */
const OFFSET_ARGENTINA = "-03:00";

function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${OFFSET_ARGENTINA}`);
}

function inicioDelDiaSiguiente(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  // Date.UTC normaliza el desborde de día, mes y año.
  const siguiente = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, (dia ?? 0) + 1));
  return inicioDelDia(siguiente.toISOString().slice(0, 10));
}

/**
 * Igual que `filtroRango`, pero para columnas `timestamp` en vez de `date`.
 *
 * La diferencia no es cosmética: comparar un instante contra `'2026-08-11'` lo
 * interpreta como la medianoche de ese día, así que un `<=` dejaría afuera
 * todo lo que pasó durante la jornada. Por eso el extremo superior se compara
 * con `<` contra el arranque del día siguiente, en hora argentina.
 */
export function filtroRangoInstante(columna: PgColumn, rango: RangoFechas): SQL | undefined {
  const condiciones: SQL[] = [];
  if (rango.desde) {
    condiciones.push(gte(columna, inicioDelDia(rango.desde)));
  }
  if (rango.hasta) {
    condiciones.push(lt(columna, inicioDelDiaSiguiente(rango.hasta)));
  }
  if (condiciones.length === 0) {
    return undefined;
  }
  return condiciones.length === 1 ? condiciones[0] : and(...condiciones);
}
