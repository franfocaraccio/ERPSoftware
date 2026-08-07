import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../auth/auth.js";
import { linkInvitacion } from "../../auth/emails.js";
import { ROL_PLATAFORMA_ADMIN, ROL_PLATAFORMA_USUARIO } from "../../auth/roles.js";
import { db } from "../../db/client.js";
import { invitation, member, organization, user } from "../../db/schema/auth.js";
import { adminPlataformaProcedure, router } from "../../trpc/trpc.js";

/**
 * Panel de plataforma: crear organizaciones, invitar administradores y dar de alta más
 * admins. Estos procedures NO pasan por withTenant y no tocan ninguna tabla de
 * negocio — por decisión de producto, un admin de plataforma no puede ver los
 * datos de las PyMEs.
 */
const nombreSchema = z.string().trim().min(1, "El nombre es obligatorio").max(120);

/** "Distribuidora del Plata SA" → "distribuidora-del-plata-sa" */
function generarSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
}

async function slugDisponible(base: string): Promise<string> {
  let slug = base || "organizacion";
  let intento = 1;
  while (true) {
    const [existe] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (!existe) {
      return slug;
    }
    intento += 1;
    slug = `${base}-${intento}`;
  }
}

export const plataformaRouter = router({
  /** Listado de organizaciones con su administrador y cuántos miembros tiene. */
  organizaciones: adminPlataformaProcedure.query(async () => {
    const filas = await db
      .select({
        id: organization.id,
        nombre: organization.name,
        slug: organization.slug,
        creada: organization.createdAt,
        // Las subconsultas van con las tablas calificadas a mano: interpolar
        // las columnas de Drizzle acá las renderiza sin prefijo y quedan
        // ambiguas contra la tabla externa.
        miembros: sql<number>`(
          select count(*)::int from "member" m where m.organization_id = "organization".id
        )`,
        invitacionesPendientes: sql<number>`(
          select count(*)::int from "invitation" i
          where i.organization_id = "organization".id and i.status = 'pending'
        )`,
        administradorEmail: sql<string | null>`(
          select u.email from "member" m
          join "user" u on u.id = m.user_id
          where m.organization_id = "organization".id and m.role = 'administrador'
          limit 1
        )`,
      })
      .from(organization)
      .orderBy(desc(organization.createdAt));
    return filas;
  }),

  /**
   * Crea la organización e invita a su administrador en un solo paso: es el flujo
   * real de alta de un cliente nuevo.
   */
  crearOrganizacion: adminPlataformaProcedure
    .input(
      z.object({
        nombre: nombreSchema,
        emailAdministrador: z.email("Email inválido"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = await slugDisponible(generarSlug(input.nombre));

      const creada = await auth.api.createOrganization({
        body: { name: input.nombre, slug, userId: ctx.usuarioId },
      });
      if (!creada) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo crear" });
      }

      // Crear la organización deja al admin como miembro, y esa membresía es
      // justo lo que habilita a invitar. Recién después de mandar la
      // invitación se la quitamos: un admin de plataforma no debe poder ver
      // los datos de la PyME.
      //
      // Los llamados a auth.api no comparten transacción con nosotros, así que
      // si la invitación falla hay que deshacer la organización a mano: si no,
      // queda una empresa huérfana que nadie puede reclamar.
      let invitacionId: string;
      try {
        const invitacion = await auth.api.createInvitation({
          body: {
            email: input.emailAdministrador,
            role: "administrador",
            organizationId: creada.id,
          },
          headers: ctx.headers,
        });
        invitacionId = invitacion.id;
      } catch (error) {
        await db.delete(organization).where(eq(organization.id, creada.id));
        throw error;
      }

      await db.delete(member).where(eq(member.organizationId, creada.id));

      // El link va en la respuesta además del mail: sin proveedor de correo
      // configurado, es la única forma de hacérselo llegar al administrador.
      return {
        id: creada.id,
        nombre: creada.name,
        slug: creada.slug,
        link: linkInvitacion(invitacionId),
      };
    }),

  /** Invitaciones pendientes de todas las organizaciones. */
  invitacionesPendientes: adminPlataformaProcedure.query(async () => {
    const filas = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        rol: invitation.role,
        expira: invitation.expiresAt,
        organizacion: organization.name,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(eq(invitation.status, "pending"))
      .orderBy(desc(invitation.expiresAt));

    // El link también acá: si se cierra el cartel de "recién creada", esta es
    // la única forma de recuperarlo.
    return filas.map((f) => ({ ...f, link: linkInvitacion(f.id) }));
  }),

  cancelarInvitacion: adminPlataformaProcedure
    .input(z.object({ invitacionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.cancelInvitation({
        body: { invitationId: input.invitacionId },
        headers: ctx.headers,
      });
      return { ok: true };
    }),

  /** Admins de la plataforma (nosotros). */
  admins: adminPlataformaProcedure.query(async () => {
    return db
      .select({ id: user.id, nombre: user.name, email: user.email, creado: user.createdAt })
      .from(user)
      .where(eq(user.role, ROL_PLATAFORMA_ADMIN))
      .orderBy(desc(user.createdAt));
  }),

  /** Un admin da de alta a otro admin, con contraseña inicial. */
  crearAdmin: adminPlataformaProcedure
    .input(
      z.object({
        nombre: nombreSchema,
        email: z.email("Email inválido"),
        password: z.string().min(12, "Mínimo 12 caracteres"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const creado = await auth.api.createUser({
        body: {
          name: input.nombre,
          email: input.email,
          password: input.password,
          role: ROL_PLATAFORMA_ADMIN,
        },
        headers: ctx.headers,
      });
      return { id: creado.user.id, email: creado.user.email };
    }),

  /** Quita el rol de plataforma sin borrar el usuario. */
  quitarAdmin: adminPlataformaProcedure
    .input(z.object({ usuarioId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.usuarioId === ctx.usuarioId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés quitarte a vos mismo el rol de admin",
        });
      }
      await db
        .update(user)
        .set({ role: ROL_PLATAFORMA_USUARIO })
        .where(eq(user.id, input.usuarioId));
      return { ok: true };
    }),
});
