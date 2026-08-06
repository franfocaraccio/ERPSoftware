import { initTRPC, TRPCError } from "@trpc/server";
import { ROLES_ESCRITURA, ROLES_GESTION_USUARIOS, type RolOrganizacion } from "../auth/roles.js";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

export const router = t.router;

/** Solo para health, login e invitaciones. Nada de datos de negocio. */
export const publicProcedure = t.procedure;

/** Exige sesión válida. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});

/**
 * Base de todo procedure de negocio: exige organización activa e inyecta
 * tenantId (siempre desde la sesión del servidor, jamás del cliente).
 */
export const tenantProcedure = protectedProcedure.use(({ ctx, next }) => {
  const tenantId = ctx.session.activeOrganizationId;
  if (!tenantId || !ctx.session.rolOrganizacion) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No hay organización activa en la sesión",
    });
  }
  return next({
    ctx: {
      tenantId,
      usuarioId: ctx.session.usuarioId,
      rol: ctx.session.rolOrganizacion,
      session: ctx.session,
    },
  });
});

/** Restringe un procedure a un conjunto de roles de la organización. */
function exigirRoles(permitidos: readonly RolOrganizacion[]) {
  return tenantProcedure.use(({ ctx, next }) => {
    if (!permitidos.includes(ctx.rol)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tu rol no permite esta operación",
      });
    }
    return next({ ctx });
  });
}

/** Escritura de datos de negocio: dueño y administrativo. */
export const escrituraProcedure = exigirRoles(ROLES_ESCRITURA);

/** Gestión de usuarios de la organización: solo el dueño. */
export const duenoProcedure = exigirRoles(ROLES_GESTION_USUARIOS);

/**
 * Procedures del panel de plataforma. Un admin gestiona organizaciones e
 * invitaciones, pero por decisión de producto NO accede a los datos de las
 * PyMEs: por eso no deriva de tenantProcedure.
 */
export const adminPlataformaProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.session.esAdminPlataforma) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requiere permisos de plataforma" });
  }
  return next({
    ctx: { usuarioId: ctx.session.usuarioId, session: ctx.session, headers: ctx.headers },
  });
});
