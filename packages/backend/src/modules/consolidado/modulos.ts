/**
 * Los módulos que puede abarcar un link de solo lectura. Al generarlo se
 * eligen cuáles (decisión de Fran del 12/10/2026): por ejemplo, sólo Panel e
 * Impuestos para el contador.
 */
export const MODULOS_LINK = [
  "panel",
  "clientes",
  "proveedores",
  "stock",
  "tesoreria",
  "impuestos",
  "comprobantes",
  "resultados",
] as const;

export type ModuloLink = (typeof MODULOS_LINK)[number];

/**
 * A qué módulo pertenece cada procedure, por su ruta tRPC. Lo que no está
 * acá y no es de uso general se niega a un link con alcance: es más seguro
 * olvidarse de habilitar algo que olvidarse de bloquearlo.
 */
const POR_ROUTER: Record<string, ModuloLink | "siempre"> = {
  financiero: "panel",
  explicacion: "panel",
  cotizaciones: "panel",
  clientes: "clientes",
  proveedores: "proveedores",
  stock: "stock",
  tesoreria: "tesoreria",
  impuestos: "impuestos",
  comprobantes: "comprobantes",
  resultados: "resultados",
  // Lo que leen todas las pantallas: los umbrales y la sesión del link.
  parametros: "siempre",
  consolidado: "siempre",
};

/** Las fichas y la imputación viven en un router propio pero son de otro módulo. */
const POR_PROCEDURE: Record<string, ModuloLink> = {
  "cuentaCorriente.cliente": "clientes",
  "cuentaCorriente.proveedor": "proveedores",
  "cuentaCorriente.abiertos": "tesoreria",
};

/** True si un link con esos módulos puede llamar a ese procedure. */
export function permitidoPorLink(path: string, modulos: readonly string[]): boolean {
  const modulo = POR_PROCEDURE[path] ?? POR_ROUTER[path.split(".")[0] ?? ""];
  return modulo === "siempre" || (modulo !== undefined && modulos.includes(modulo));
}
