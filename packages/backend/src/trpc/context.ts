import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth/auth.js";
import { esRolOrganizacion, ROL_PLATAFORMA_ADMIN, type RolOrganizacion } from "../auth/roles.js";
import { db } from "../db/client.js";
import { member } from "../db/schema/auth.js";

export interface Sesion {
  usuarioId: string;
  email: string;
  nombre: string;
  /** Organización activa de BetterAuth — la única fuente del tenant. */
  activeOrganizationId: string | null;
  /** Rol dentro de la organización activa. Null si no hay organización. */
  rolOrganizacion: RolOrganizacion | null;
  /** True si es admin de la plataforma (nosotros), no de una PyME. */
  esAdminPlataforma: boolean;
  /** Si la sesión tiene el segundo factor verificado. */
  dosFactoresVerificado: boolean;
}

export interface Context {
  session: Sesion | null;
  /** Headers del request, para reenviar a `auth.api` cuando hace falta. */
  headers: Headers;
}

/**
 * Resuelve la sesión del lado servidor a partir de las cookies. El tenantId
 * nunca sale de un parámetro del cliente: se deriva de la organización activa
 * de la sesión, y el rol se lee de la tabla de miembros.
 */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const headers = fromNodeHeaders(req.headers);
  const resultado = await auth.api.getSession({ headers });
  if (!resultado) {
    return { session: null, headers };
  }

  const { user, session } = resultado;
  const activeOrganizationId = session.activeOrganizationId ?? null;

  let rolOrganizacion: RolOrganizacion | null = null;
  if (activeOrganizationId) {
    // La membresía se relee en cada request: si al usuario le cambian el rol
    // o lo sacan de la organización, deja de aplicar sin esperar a que expire
    // la sesión.
    const [membresia] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, user.id), eq(member.organizationId, activeOrganizationId)))
      .limit(1);
    if (membresia && esRolOrganizacion(membresia.role)) {
      rolOrganizacion = membresia.role;
    }
  }

  return {
    headers,
    session: {
      usuarioId: user.id,
      email: user.email,
      nombre: user.name,
      // Sin membresía vigente no hay organización activa válida, aunque la
      // sesión la traiga: evita que un usuario removido siga operando.
      activeOrganizationId: rolOrganizacion ? activeOrganizationId : null,
      rolOrganizacion,
      esAdminPlataforma: user.role === ROL_PLATAFORMA_ADMIN,
      dosFactoresVerificado: Boolean(user.twoFactorEnabled),
    },
  };
}
