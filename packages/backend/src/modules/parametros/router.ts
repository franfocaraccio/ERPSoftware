import { administradorProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { parametrosGuardarSchema } from "./schema.js";
import { guardarParametros, obtenerParametros } from "./service.js";

export const parametrosRouter = router({
  /**
   * Lectura abierta a todo miembro: son los umbrales con los que se leen los
   * indicadores, y quien ve el panel necesita saber contra qué se compara.
   */
  obtener: tenantProcedure.query(({ ctx }) => obtenerParametros(ctx)),

  /** Configurarlos es cambiar cómo se mide la empresa: solo el Administrador. */
  guardar: administradorProcedure
    .input(parametrosGuardarSchema)
    .mutation(({ ctx, input }) => guardarParametros(ctx, input)),
});
