import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { organization } from "../db/schema/auth.js";

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
  return { tenantId: id, usuarioId };
}
