import { TRPCError } from "@trpc/server";
import { auth } from "../../auth/auth.js";
import { administradorProcedure, router } from "../../trpc/trpc.js";
import { cambiarAccesoPanelSchema, cancelarInvitacionSchema, invitarSchema } from "./schema.js";
import {
  borrarPermisoInvitacion,
  cambiarAccesoPanel,
  esMiembro,
  invitacionDelTenant,
  listarEquipo,
  registrarPermisoInvitacion,
} from "./service.js";

/**
 * Gestión del equipo de una PyME. Es el segundo nivel de invitación: nosotros
 * damos de alta la empresa con su Administrador, y el Administrador suma a su
 * gente sin pasar por nosotros.
 *
 * Todo el router va con `administradorProcedure`: el resto de los roles no
 * gestiona usuarios.
 */
export const equipoRouter = router({
  listar: administradorProcedure.query(({ ctx }) => {
    return listarEquipo(ctx);
  }),

  invitar: administradorProcedure.input(invitarSchema).mutation(async ({ ctx, input }) => {
    const email = input.email.trim().toLowerCase();

    // La invitación la crea BetterAuth (manda el mail y controla el estado);
    // el permiso de panel es nuestro y se guarda aparte, contra su id.
    let invitacionId: string;
    try {
      const creada = await auth.api.createInvitation({
        body: { email, role: input.rol, organizationId: ctx.tenantId },
        headers: ctx.headers,
      });
      invitacionId = creada.id;
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la invitación. Revisá el email e intentá de nuevo.",
      });
    }

    await registrarPermisoInvitacion(ctx, invitacionId, input.verPanel);

    return { id: invitacionId, email };
  }),

  cancelarInvitacion: administradorProcedure
    .input(cancelarInvitacionSchema)
    .mutation(async ({ ctx, input }) => {
      // El id llega del cliente: hay que confirmar que la invitación es de esta
      // organización antes de tocarla.
      if (!(await invitacionDelTenant(ctx.tenantId, input.invitacionId))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "La invitación no existe" });
      }

      await auth.api.cancelInvitation({
        body: { invitationId: input.invitacionId },
        headers: ctx.headers,
      });
      await borrarPermisoInvitacion(ctx.tenantId, input.invitacionId);

      return { ok: true };
    }),

  cambiarAccesoPanel: administradorProcedure
    .input(cambiarAccesoPanelSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await esMiembro(ctx.tenantId, input.usuarioId))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Esa persona no está en tu equipo" });
      }

      await cambiarAccesoPanel(ctx, input.usuarioId, input.verPanel);
      return { ok: true };
    }),
});
