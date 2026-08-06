import { initTRPC, TRPCError } from "@trpc/server";
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
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No hay organización activa en la sesión",
    });
  }
  return next({ ctx: { tenantId, usuarioId: ctx.session.usuarioId } });
});
