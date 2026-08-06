import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { impuestoActualizarSchema, impuestoInputSchema, impuestosListarSchema } from "./schema.js";
import { actualizarImpuesto, crearImpuesto, listarImpuestos, obtenerImpuesto } from "./service.js";

export const impuestosRouter = router({
  listar: tenantProcedure.input(impuestosListarSchema).query(({ ctx, input }) => {
    return listarImpuestos(ctx, input);
  }),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const impuesto = await obtenerImpuesto(ctx, input.id);
    if (!impuesto) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Obligación no encontrada" });
    }
    return impuesto;
  }),

  crear: escrituraProcedure.input(impuestoInputSchema).mutation(({ ctx, input }) => {
    return crearImpuesto(ctx, input);
  }),

  actualizar: escrituraProcedure
    .input(impuestoActualizarSchema)
    .mutation(async ({ ctx, input }) => {
      const impuesto = await actualizarImpuesto(ctx, input);
      if (!impuesto) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Obligación no encontrada" });
      }
      return impuesto;
    }),
});
