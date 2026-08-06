import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, magicLink, organization, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as authSchema from "../db/schema/auth.js";
import { enviarInvitacion, enviarMagicLink, enviarRecuperacion } from "./emails.js";
import { ac, rolesOrganizacion } from "./permisos.js";
import { ROL_PLATAFORMA_ADMIN, ROL_PLATAFORMA_USUARIO } from "./roles.js";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("Falta la variable de entorno BETTER_AUTH_SECRET");
}

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  trustedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:5173"],
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),

  emailAndPassword: {
    enabled: true,
    // Registro público desactivado: el alta es solo por invitación.
    disableSignUp: true,
    sendResetPassword: async ({ user, url }) => {
      await enviarRecuperacion({ email: user.email, url });
    },
  },

  user: {
    additionalFields: {
      // Rol de plataforma (plugin admin). 'user' para los miembros de PyMEs.
      role: { type: "string", defaultValue: ROL_PLATAFORMA_USUARIO, input: false },
    },
  },

  databaseHooks: {
    session: {
      create: {
        /**
         * Al iniciar sesión se fija la organización activa, que es de donde
         * sale el tenantId de toda la aplicación. Si el usuario pertenece a
         * varias (caso del contador), se elige la primera y después puede
         * cambiarla desde el selector.
         */
        before: async (session) => {
          const [membresia] = await db
            .select({ organizationId: authSchema.member.organizationId })
            .from(authSchema.member)
            .where(eq(authSchema.member.userId, session.userId))
            .limit(1);
          return {
            data: { ...session, activeOrganizationId: membresia?.organizationId ?? null },
          };
        },
      },
    },
  },

  plugins: [
    organization({
      // Roles del dominio. Estos permisos gobiernan la gestión de la
      // organización; el acceso a los datos de negocio lo deciden los
      // middlewares de tRPC, no la UI.
      ac,
      roles: rolesOrganizacion,
      creatorRole: "dueno",
      sendInvitationEmail: async (datos) => {
        await enviarInvitacion({
          email: datos.email,
          organizacion: datos.organization.name,
          invitadoPor: datos.inviter.user.name || datos.inviter.user.email,
          invitacionId: datos.id,
        });
      },
    }),

    // Rol de plataforma: quien crea organizaciones e invita dueños.
    admin({ adminRoles: [ROL_PLATAFORMA_ADMIN], defaultRole: ROL_PLATAFORMA_USUARIO }),

    // Solo para el panel de solo lectura de la Vista Consolidada.
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await enviarMagicLink({ email, url });
      },
    }),

    twoFactor(),
  ],
});

export type Auth = typeof auth;
