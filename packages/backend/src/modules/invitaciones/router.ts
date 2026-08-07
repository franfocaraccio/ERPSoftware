import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../auth/auth.js";
import { esRolOrganizacion } from "../../auth/roles.js";
import { db } from "../../db/client.js";
import { account, invitation, member, organization, user } from "../../db/schema/auth.js";
import { publicProcedure, router } from "../../trpc/trpc.js";
import { traspasarPermisoDeInvitacion } from "../equipo/service.js";

/**
 * Alta por invitación. El registro público está desactivado a propósito, así
 * que este es el único camino para que exista un usuario nuevo: la invitación
 * se valida del lado servidor ANTES de crear la cuenta.
 */

async function buscarInvitacionVigente(id: string) {
  const [fila] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      rol: invitation.role,
      estado: invitation.status,
      expira: invitation.expiresAt,
      organizacionId: invitation.organizationId,
      organizacion: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, id))
    .limit(1);

  if (fila?.estado !== "pending" || fila.expira.getTime() < Date.now()) {
    return null;
  }
  return fila;
}

async function existeUsuario(email: string): Promise<boolean> {
  const [fila] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return Boolean(fila);
}

export const invitacionesRouter = router({
  /** Datos mínimos para pintar la pantalla, sin exponer nada sensible. */
  ver: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const inv = await buscarInvitacionVigente(input.id);
    if (!inv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "La invitación no existe, ya fue usada o venció",
      });
    }
    // Un mismo mail puede estar en varias empresas (el contador que atiende a
    // varias). Si ya tiene cuenta no hay contraseña que definir: la pantalla
    // tiene que pedir otra cosa. Decirlo no filtra nada nuevo, porque el link
    // ya revela de qué mail se trata.
    return {
      email: inv.email,
      organizacion: inv.organizacion,
      rol: inv.rol,
      yaTieneCuenta: await existeUsuario(inv.email),
    };
  }),

  /**
   * Crea la membresía y, si hace falta, la cuenta. No devuelve sesión: el
   * frontend hace login normal después.
   *
   * Nombre y contraseña solo se piden cuando el mail no tiene cuenta todavía.
   * A quien ya la tiene no se le puede —ni se le debe— cambiar la contraseña
   * desde una invitación: entra con la que ya usa.
   */
  aceptar: publicProcedure
    .input(
      z.object({
        id: z.string(),
        nombre: z.string().trim().min(1).max(120).optional(),
        password: z.string().min(12, "Mínimo 12 caracteres").optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const inv = await buscarInvitacionVigente(input.id);
      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "La invitación no existe, ya fue usada o venció",
        });
      }

      const rol = inv.rol && esRolOrganizacion(inv.rol) ? inv.rol : "solo_lectura";
      const ctx = await auth.$context;
      const ahora = new Date();

      const [existente] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, inv.email))
        .limit(1);

      let usuarioId = existente?.id;

      if (!usuarioId) {
        // La obligatoriedad se valida acá y no en el schema: depende de si el
        // usuario existe, cosa que solo se sabe del lado servidor.
        if (!input.nombre || !input.password) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Faltan tu nombre y una contraseña para crear la cuenta",
          });
        }
        usuarioId = randomUUID();
        await db.insert(user).values({
          id: usuarioId,
          name: input.nombre,
          email: inv.email,
          // El mail queda verificado: llegó acá por un link enviado a esa casilla.
          emailVerified: true,
          role: "user",
          createdAt: ahora,
          updatedAt: ahora,
        });
        await db.insert(account).values({
          id: randomUUID(),
          accountId: usuarioId,
          providerId: "credential",
          userId: usuarioId,
          password: await ctx.password.hash(input.password),
          createdAt: ahora,
          updatedAt: ahora,
        });
      }

      // Un mail puede pertenecer a varias organizaciones (el caso del contador):
      // se agrega la membresía nueva sin tocar las anteriores.
      const [yaMiembro] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.userId, usuarioId), eq(member.organizationId, inv.organizacionId)))
        .limit(1);

      if (!yaMiembro) {
        await db.insert(member).values({
          id: randomUUID(),
          organizationId: inv.organizacionId,
          userId: usuarioId,
          role: rol,
          createdAt: ahora,
        });
      }

      // El acceso al panel se eligió al invitar: ahora que hay miembro, la
      // reserva pasa a ser el permiso de esa persona.
      await traspasarPermisoDeInvitacion(inv.organizacionId, inv.id, usuarioId);

      await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, inv.id));

      return { email: inv.email, usuarioNuevo: !existente };
    }),
});
