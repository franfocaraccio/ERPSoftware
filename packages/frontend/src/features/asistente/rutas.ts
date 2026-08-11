/**
 * Rutas que el asistente puede linkear.
 *
 * Es una lista blanca, no una validación de formato: el modelo escribe el
 * destino y podría inventar una ruta que no existe, o escribirla con una
 * variante que el router no matchea. Un link roto es peor que texto plano
 * —promete algo y no cumple—, así que lo que no está acá se muestra como
 * texto y listo.
 *
 * Quedan afuera a propósito las rutas con parámetro (`/clientes/$clienteId`):
 * sin el id no hay nada a dónde ir.
 *
 * Vive en su propio archivo, separado del render, porque `rutas.test.ts` la
 * compara contra el árbol de rutas real. Esta lista y el router son dos
 * fuentes que se pueden desincronizar en silencio, y esa comparación es lo
 * único que lo evita.
 */
export const RUTAS = [
  "/panel",
  "/clientes",
  "/clientes/nuevo",
  "/proveedores",
  "/proveedores/nuevo",
  "/stock",
  "/stock/nuevo",
  "/tesoreria",
  "/impuestos",
  "/impuestos/nueva",
  "/comprobantes",
  "/comprobantes/nuevo",
  "/equipo",
  "/parametros",
  "/historial",
  "/accesos",
  "/recuperar",
] as const;

export type RutaConocida = (typeof RUTAS)[number];

export function esRutaConocida(ruta: string): ruta is RutaConocida {
  return (RUTAS as readonly string[]).includes(ruta);
}
