import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { organization } from "../db/schema/auth.js";

const creadas: string[] = [];

/**
 * Crea una organización real para un test y devuelve el actor que esperan los
 * services. Antes los tests usaban un tenantId inventado, pero desde que
 * `tenant_id` tiene FK contra `organization` tiene que existir de verdad.
 *
 * Cada test usa la suya, así el aislamiento por RLS los mantiene independientes.
 */
export async function crearTenantDePrueba(usuarioId = "test-user") {
  const id = randomUUID();
  await db.insert(organization).values({
    id,
    name: `Test ${id.slice(0, 8)}`,
    slug: `test-${id}`,
    createdAt: new Date(),
  });
  creadas.push(id);
  return { tenantId: id, usuarioId };
}

/**
 * Borra las organizaciones del test. La FK de tenant_id es ON DELETE CASCADE,
 * así que se lleva todos los datos de negocio con ella: sin esto la base (y el
 * panel de plataforma) se llenan de basura con cada corrida.
 */
export async function limpiarTenantsDePrueba(): Promise<void> {
  if (creadas.length === 0) {
    return;
  }
  await db.delete(organization).where(inArray(organization.id, creadas));
  creadas.length = 0;
}
