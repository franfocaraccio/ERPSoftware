import { TRPCError } from "@trpc/server";
import { auth } from "../../auth/auth.js";
import { linkInvitacion } from "../../auth/emails.js";
import type { RolOrganizacion } from "../../auth/roles.js";
import { administradorProcedure, router } from "../../trpc/trpc.js";
import {
  cambiarAccesoPanelSchema,
  cambiarRolSchema,
  cancelarInvitacionSchema,
  invitarSchema,
  quitarMiembroSchema,
} from "./schema.js";
import {
  administradoresRestantes,
  borrarPermisoInvitacion,
  cambiarAccesoPanel,
  cambiarRolMiembro,
  esMiembro,
  invitacionDelTenant,
  listarEquipo,
  quitarMiembro,
  registrarPermisoInvitacion,
  rolDeMiembro,
} from "./service.js";

/**
 * Invariante: la organización nunca puede quedarse sin Administrador, porque
 * desde adentro no habría forma de recuperarla —nadie podría invitar ni cambiar
 * roles—. Con los permisos actuales el caso no se puede provocar (quien opera
 * es Administrador y no puede tocarse a sí mismo), pero la regla se chequea
 * igual: es la garantía que no queremos que dependa de eso.
 */
async function verificarQuedaAdministrador(
  tenantId: string,
  usuarioId: string,
  rolActual: RolOrganizacion,
  rolNuevo: RolOrganizacion | null,
): Promise<void> {
  if (rolActual !== "administrador" || rolNuevo === "administrador") {
    return;
  }
  if ((await administradoresRestantes(tenantId, usuarioId)) === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La empresa quedaría sin ningún Administrador.",
    });
  }
}

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

    // El link se devuelve además de mandarse por mail: mientras no haya
    // proveedor de correo configurado, es la única forma de hacérselo llegar.
    return { id: invitacionId, email, link: linkInvitacion(invitacionId) };
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

  cambiarRol: administradorProcedure.input(cambiarRolSchema).mutation(async ({ ctx, input }) => {
    // Cambiarse el rol a uno mismo es la forma más fácil de quedarse afuera de
    // la gestión sin poder volver: lo tiene que hacer otro Administrador.
    if (input.usuarioId === ctx.usuarioId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No podés cambiarte el rol a vos mismo. Pedíselo a otro Administrador.",
      });
    }

    const rolActual = await rolDeMiembro(ctx.tenantId, input.usuarioId);
    if (!rolActual) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Esa persona no está en tu equipo" });
    }
    if (rolActual === input.rol) {
      return { ok: true };
    }
    await verificarQuedaAdministrador(ctx.tenantId, input.usuarioId, rolActual, input.rol);

    await cambiarRolMiembro(ctx, input.usuarioId, input.rol);
    return { ok: true };
  }),

  quitarMiembro: administradorProcedure
    .input(quitarMiembroSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.usuarioId === ctx.usuarioId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés sacarte a vos mismo de la empresa.",
        });
      }

      const rolActual = await rolDeMiembro(ctx.tenantId, input.usuarioId);
      if (!rolActual) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Esa persona no está en tu equipo" });
      }
      await verificarQuedaAdministrador(ctx.tenantId, input.usuarioId, rolActual, null);

      await quitarMiembro(ctx, input.usuarioId);
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
