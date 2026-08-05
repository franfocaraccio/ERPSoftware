import { sql } from "drizzle-orm";
import { db } from "./client.js";

/** Transacción Drizzle con el tenant ya declarado vía SET LOCAL. */
export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Único punto de acceso a la base para código de negocio (regla dura del CLAUDE.md).
 *
 * Abre una transacción y declara `app.tenant_id` con SET LOCAL (set_config con
 * is_local=true), que es lo que leen las políticas RLS. Al cerrar la transacción
 * la conexión vuelve limpia al pool.
 *
 * El tenantId debe salir SIEMPRE de la sesión del servidor
 * (activeOrganizationId de BetterAuth), nunca de un parámetro del cliente.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenant: tenantId vacío");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
