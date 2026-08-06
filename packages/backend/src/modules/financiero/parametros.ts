import { eq } from "drizzle-orm";
import { parametros } from "../../db/schema/parametros.js";
import type { TenantTx } from "../../db/tenant-db.js";

export interface ParametrosTenant {
  umbralMoraDias: number;
  margenObjetivo: string | null;
  minimoOperativo: string | null;
}

/** Valores por defecto cuando la empresa todavía no configuró los suyos. */
const POR_DEFECTO: ParametrosTenant = {
  umbralMoraDias: 60,
  margenObjetivo: null,
  minimoOperativo: null,
};

/**
 * Umbrales que la especificación define como "definidos por el cliente".
 * Los usan los semáforos de KPIs y de la proyección de caja.
 */
export async function obtenerParametros(tx: TenantTx, tenantId: string): Promise<ParametrosTenant> {
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
