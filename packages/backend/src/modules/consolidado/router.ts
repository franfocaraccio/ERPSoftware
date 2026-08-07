import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { organization } from "../../db/schema/auth.js";
import { administradorProcedure, publicProcedure, router } from "../../trpc/trpc.js";
import {
  crearAcceso,
  HORAS_DE_VIDA,
  listarAccesos,
  revocarAcceso,
  validarToken,
} from "./service.js";

/**
 * Accesos de solo lectura por link, para mostrarle la empresa a alguien que no
 * tiene cuenta —el contador, el banco, un socio—.
 *
 * Los genera y los revoca el Administrador. El visitante no tiene ningún
 * endpoint propio: una vez validado el token, entra por los mismos procedures
 * que cualquier miembro de solo lectura (ver `trpc/context.ts`).
 */
export const consolidadoRouter = router({
  listar: administradorProcedure.query(({ ctx }) => listarAccesos(ctx)),

  crear: administradorProcedure
    .input(
      z.object({
        descripcion: z
          .string()
          .trim()
          .min(1, "Poné para quién es, así después sabés cuál revocar")
          .max(80),
      }),
    )
    .mutation(({ ctx, input }) => crearAcceso(ctx, input.descripcion)),

  revocar: administradorProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await revocarAcceso(ctx, input.id))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese acceso ya no existe" });
      }
      return { ok: true };
    }),

  /** Cuántas horas dura un acceso nuevo. Lo muestra la pantalla al generarlo. */
  duracionHoras: administradorProcedure.query(() => HORAS_DE_VIDA),

  /**
   * Canje del link. Es público porque quien lo abre todavía no es nadie: el
   * token es la credencial. Devuelve solo con qué empresa se va a encontrar,
   * para poder mostrarlo antes de entrar.
   */
  abrir: publicProcedure
    .input(z.object({ tenantId: z.string().min(1), token: z.string().min(1) }))
    .query(async ({ input }) => {
      const acceso = await validarToken(input.tenantId, input.token);
      if (!acceso) {
        // Un solo mensaje para las tres causas —no existe, revocado, vencido—:
        // quien tiene el link no tiene por qué saber cuál de ellas es.
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Este enlace no es válido o ya venció. Pedile uno nuevo a la empresa.",
        });
      }

      const [empresa] = await db
        .select({ nombre: organization.name })
        .from(organization)
        .where(eq(organization.id, acceso.tenantId))
        .limit(1);

      return {
        empresa: empresa?.nombre ?? "",
        descripcion: acceso.descripcion,
        expira: acceso.expira,
      };
    }),
});
