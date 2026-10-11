import type { TenantTx } from "../../db/tenant-db.js";
import { leerParametros, type Parametros } from "../parametros/service.js";

export type { Parametros as ParametrosTenant };

/**
 * Lee los umbrales dentro de la transacción que ya abrió el resumen financiero.
 *
 * Es un alias de `leerParametros`: la lectura y los valores por defecto viven
 * en el módulo de parámetros, para que no puedan divergir.
 */
export async function obtenerParametros(tx: TenantTx, tenantId: string): Promise<Parametros> {
  return leerParametros(tx, tenantId);
}
