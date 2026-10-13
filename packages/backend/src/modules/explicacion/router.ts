import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import { ExplicacionNoDisponibleError, explicacionHabilitada, explicarMes } from "./service.js";

export const explicacionRouter = router({
  /** Si hay API key: la pantalla no ofrece un botón que va a fallar siempre. */
  habilitada: tenantProcedure.query(() => explicacionHabilitada()),

  /**
   * Mutation y no query: cuesta plata. Que no la dispare un refetch al volver
   * a la pestaña.
   */
  generar: tenantProcedure.mutation(async ({ ctx }) => {
    if (!explicacionHabilitada()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La IA no está configurada." });
    }
    try {
      return await explicarMes(ctx);
    } catch (error) {
      if (error instanceof ExplicacionNoDisponibleError) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
      }
      throw error;
    }
  }),
});
