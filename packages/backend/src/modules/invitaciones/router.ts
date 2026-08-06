import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../auth/auth.js";
import { esRolOrganizacion } from "../../auth/roles.js";
import { db } from "../../db/client.js";
import { account, invitation, member, organization, user } from "../../db/schema/auth.js";
import { publicProcedure, router } from "../../trpc/trpc.js";

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

  if (!fila || fila.estado !== "pending" || fila.expira.getTime() < Date.now()) {
    return null;
  }
  return fila;
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
    return { email: inv.email, organizacion: inv.organizacion, rol: inv.rol };
  }),

  /**
   * Crea la cuenta y la membresía. No devuelve sesión: el frontend hace login
   * normal con las credenciales recién definidas.
   */
  aceptar: publicProcedure
    .input(
      z.object({
        id: z.string(),
        nombre: z.string().trim().min(1).max(120),
        password: z.string().min(12, "Mínimo 12 caracteres"),
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

      await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, inv.id));

      return { email: inv.email, usuarioNuevo: !existente };
    }),
});
