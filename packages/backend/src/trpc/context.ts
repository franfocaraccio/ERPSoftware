import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth/auth.js";
import { esRolOrganizacion, ROL_PLATAFORMA_ADMIN, type RolOrganizacion } from "../auth/roles.js";
import { db } from "../db/client.js";
import { member } from "../db/schema/auth.js";
import { validarToken } from "../modules/consolidado/service.js";

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
  /**
   * True cuando entró por un link de solo lectura y no por una cuenta. La UI lo
   * usa para explicar qué está viendo; los permisos no dependen de esto sino
   * del rol, que en ese caso es `solo_lectura`.
   */
  esAccesoPorLink: boolean;
}

export interface Context {
  session: Sesion | null;
  /** Headers del request, para reenviar a `auth.api` cuando hace falta. */
  headers: Headers;
}

/** Header en el que el frontend manda el token del link de solo lectura. */
const HEADER_ACCESO = "x-acceso-consolidado";

/**
 * Sesión de un visitante que llegó por link. No hay usuario ni cuenta detrás:
 * se arma una sesión sintética con rol `solo_lectura`, que es exactamente lo
 * que ese link autoriza.
 *
 * Así todos los procedures de lectura funcionan sin tocarlos, y los de
 * escritura lo rechazan por la misma regla que ya rechaza a cualquier miembro
 * de solo lectura. No hay una segunda implementación de permisos que se pueda
 * desincronizar de la primera.
 */
async function sesionPorLink(headers: Headers): Promise<Sesion | null> {
  const crudo = headers.get(HEADER_ACCESO);
  if (!crudo) {
    return null;
  }

  // Formato "<tenantId>:<token>". El tenant viaja porque la tabla de accesos
  // tiene RLS y hay que saber a qué empresa preguntarle.
  const separador = crudo.indexOf(":");
  if (separador <= 0) {
    return null;
  }
  const tenantId = crudo.slice(0, separador);
  const token = crudo.slice(separador + 1);

  const acceso = await validarToken(tenantId, token);
  if (!acceso) {
    return null;
  }

  return {
    usuarioId: `acceso:${acceso.accesoId}`,
    email: "",
    nombre: acceso.descripcion,
    activeOrganizationId: acceso.tenantId,
    rolOrganizacion: "solo_lectura",
    esAdminPlataforma: false,
    dosFactoresVerificado: false,
    esAccesoPorLink: true,
  };
}

/**
 * Resuelve la sesión del lado servidor a partir de las cookies. El tenantId
 * nunca sale de un parámetro del cliente: se deriva de la organización activa
 * de la sesión, y el rol se lee de la tabla de miembros.
 */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const headers = fromNodeHeaders(req.headers);

  // El link de solo lectura tiene prioridad sobre la cookie: si alguien abre un
  // link estando logueado con su cuenta, lo que quiso es ver eso.
  const porLink = await sesionPorLink(headers);
  if (porLink) {
    return { session: porLink, headers };
  }

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
      esAccesoPorLink: false,
    },
  };
}
