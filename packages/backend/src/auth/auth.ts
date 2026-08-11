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

const urlFrontend = process.env.FRONTEND_URL ?? "http://localhost:5173";
const urlBackend = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";

/**
 * Si el frontend y el backend viven en hosts distintos, la cookie de sesión es
 * cross-site y el navegador no la manda con el `SameSite=Lax` que BetterAuth
 * usa por defecto: el login responde 200, la cookie se descarta y la siguiente
 * request vuelve sin sesión. Desde afuera se ve como "recarga y vuelve al
 * login", sin ningún error.
 *
 * En local no aplica: frontend y backend comparten `localhost` —el puerto no
 * cuenta para las cookies— y ahí `Lax` es lo correcto y más seguro.
 */
const sitiosDistintos = new URL(urlFrontend).hostname !== new URL(urlBackend).hostname;

export const auth = betterAuth({
  secret,
  baseURL: urlBackend,
  trustedOrigins: [urlFrontend],
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
      creatorRole: "administrador",
      sendInvitationEmail: async (datos) => {
        await enviarInvitacion({
          email: datos.email,
          organizacion: datos.organization.name,
          invitadoPor: datos.inviter.user.name || datos.inviter.user.email,
          invitacionId: datos.id,
        });
      },
    }),

    // Rol de plataforma: quien crea organizaciones e invita administradores.
    admin({ adminRoles: [ROL_PLATAFORMA_ADMIN], defaultRole: ROL_PLATAFORMA_USUARIO }),

    // Solo para el panel de solo lectura de la Vista Consolidada.
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await enviarMagicLink({ email, url });
      },
    }),

    twoFactor(),
  ],

  /**
   * De dónde sale la IP del cliente, que es la clave del rate limiting.
   *
   * Detrás del proxy de Railway, `x-forwarded-for` llega con dos saltos
   * (`<cliente>, <proxy interno>`), y BetterAuth descarta toda cadena de más
   * de un valor salvo que se declaren `trustedProxies`: sin resolver la IP,
   * mete a TODOS los clientes en un único bucket compartido por ruta. Con los
   * límites por defecto eso es la cuarta persona que intenta entrar en diez
   * segundos recibiendo un 429 — de cualquier empresa, no solo de la suya.
   *
   * Medido contra el deploy el 10 de agosto de 2026: Railway pisa tanto
   * `x-forwarded-for` como `x-real-ip`, así que un cliente no puede mentir
   * sobre su IP por ninguno de los dos. `x-real-ip` viene con un único valor,
   * que es lo que BetterAuth sabe usar sin más configuración. Se prefiere a
   * `trustedProxies` porque no obliga a mantener el rango de IPs de Railway,
   * que cambia sin avisar.
   *
   * `cf-connecting-ip` NO se usa: en la misma medición, un valor inventado por
   * el cliente llegó intacto al backend.
   *
   * Si Railway dejara de mandar `x-real-ip` —por ejemplo al activar su CDN—,
   * la IP vuelve a ser irresoluble y BetterAuth lo avisa por log con un
   * warning explícito. Ese warning es la señal para volver a medir.
   */
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-real-ip"],
    },

    /**
     * Cookie de sesión entre sitios distintos. `Secure` es obligatorio para
     * que el navegador acepte `SameSite=None`, y `Partitioned` (CHIPS) la
     * mantiene viva bajo el bloqueo de cookies de terceros de Chrome.
     *
     * Esto es un parche, no la solución: Safari bloquea las cookies de
     * terceros por defecto, así que mientras el frontend y el backend estén en
     * dominios sin relación (`vercel.app` y `railway.app`) el login puede
     * fallar en iPhone y en Mac. Lo que lo resuelve de verdad es un dominio
     * propio con ambos colgando de él —`app.` y `api.`—, que vuelve la cookie
     * de primera parte. Hay que hacerlo antes de que entre gente real.
     */
    ...(sitiosDistintos
      ? {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
            partitioned: true,
          },
        }
      : {}),
  },
});

export type Auth = typeof auth;
