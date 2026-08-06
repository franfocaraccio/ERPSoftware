import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export interface Sesion {
  usuarioId: string;
  /** Organización activa de BetterAuth — la única fuente del tenant. */
  activeOrganizationId: string | null;
}

export interface Context {
  session: Sesion | null;
}

/**
 * TODO(auth): reemplazar por la resolución real de sesión de BetterAuth.
 * Mientras tanto, en desarrollo la sesión se fabrica desde DEV_TENANT_ID /
 * DEV_USER_ID para poder ejercitar los slices con RLS real.
 */
export function createContext(_opts: CreateExpressContextOptions): Context {
  const tenantId = process.env.DEV_TENANT_ID;
  const usuarioId = process.env.DEV_USER_ID ?? "dev";
  if (!tenantId) {
    return { session: null };
  }
  return { session: { usuarioId, activeOrganizationId: tenantId } };
}
