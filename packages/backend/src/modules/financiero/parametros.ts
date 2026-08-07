import { eq } from "drizzle-orm";
import { parametros } from "../../db/schema/parametros.js";
import type { TenantTx } from "../../db/tenant-db.js";
import { type Parametros, POR_DEFECTO } from "../parametros/service.js";

export type { Parametros as ParametrosTenant };

/**
 * Lee los umbrales dentro de la transacción que ya abrió el resumen financiero.
 *
 * Existe además de `parametros/service.ts` porque ese abre su propia
 * transacción y acá estamos dentro de una. Los valores por defecto se importan
 * de allá para que no puedan divergir.
 */
export async function obtenerParametros(tx: TenantTx, tenantId: string): Promise<Parametros> {
  const [fila] = await tx
    .select()
    .from(parametros)
    .where(eq(parametros.tenantId, tenantId))
    .limit(1);
  if (!fila) {
    return POR_DEFECTO;
  }
  return {
    umbralMoraDias: fila.umbralMoraDias,
    margenObjetivo: fila.margenObjetivo,
    minimoOperativo: fila.minimoOperativo,
  };
}
