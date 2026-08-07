import { asc, desc, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * Ordenamiento de listados.
 *
 * Va del lado del servidor y no en la tabla del navegador porque los listados
 * vienen paginados: ordenar solo la página visible daría un resultado que
 * parece correcto y no lo es.
 *
 * El campo llega como enum, nunca como texto libre: la lista de columnas
 * ordenables es un contrato cerrado y no hay forma de que un input del cliente
 * termine en el ORDER BY.
 */
export const direccionSchema = z.enum(["asc", "desc"]);

export type Direccion = z.infer<typeof direccionSchema>;

export function ordenSchema<const T extends readonly [string, ...string[]]>(
  campos: T,
  porDefecto: T[number],
  direccionPorDefecto: Direccion = "asc",
) {
  return {
    orden: z.enum(campos).default(porDefecto),
    direccion: direccionSchema.default(direccionPorDefecto),
  };
}

/**
 * Traduce el campo elegido a su columna. El segundo criterio existe para que
 * el orden sea estable: sin desempate, dos filas con el mismo valor pueden
 * intercambiarse entre páginas y una queda invisible.
 */
export function aplicarOrden<C extends string>(
  columnas: Record<C, PgColumn>,
  campo: C,
  direccion: Direccion,
  desempate: PgColumn,
): SQL[] {
  const columna = columnas[campo];
  const sentido = direccion === "asc" ? asc : desc;
  return [sentido(columna), asc(desempate)];
}
