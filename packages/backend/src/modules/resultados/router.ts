import { TRPCError } from "@trpc/server";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { ReferenciaAjenaError } from "../_comunes/pertenencia.js";
import {
  categoriaActualizarSchema,
  categoriaInputSchema,
  estadoResultadosSchema,
  gastoRecurrenteActualizarSchema,
  gastoRecurrenteInputSchema,
  rentabilidadSchema,
} from "./schema.js";
import {
  actualizarCategoria,
  actualizarGastoRecurrente,
  crearCategoria,
  crearGastoRecurrente,
  listarCategorias,
  listarGastosRecurrentes,
  obtenerEstadoResultados,
  obtenerRentabilidad,
} from "./service.js";

function traducirError(error: unknown): never {
  if (error instanceof ReferenciaAjenaError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  // Nombre repetido: el índice único de (tenant, tipo, nombre).
  if (
    error instanceof Error &&
    /categorias_tenant_nombre_tipo_unq/.test(String(error.cause ?? error.message))
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Ya existe una categoría con ese nombre" });
  }
  throw error;
}

export const resultadosRouter = router({
  estado: tenantProcedure
    .input(estadoResultadosSchema)
    .query(({ ctx, input }) => obtenerEstadoResultados(ctx, input.meses)),

  rentabilidad: tenantProcedure
    .input(rentabilidadSchema)
    .query(({ ctx, input }) => obtenerRentabilidad(ctx, input)),

  categorias: router({
    listar: tenantProcedure.query(({ ctx }) => listarCategorias(ctx)),
    crear: escrituraProcedure
      .input(categoriaInputSchema)
      .mutation(({ ctx, input }) => crearCategoria(ctx, input).catch(traducirError)),
    actualizar: escrituraProcedure
      .input(categoriaActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const categoria = await actualizarCategoria(ctx, input).catch(traducirError);
        if (!categoria) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Categoría no encontrada" });
        }
        return categoria;
      }),
  }),

  recurrentes: router({
    listar: tenantProcedure.query(({ ctx }) => listarGastosRecurrentes(ctx)),
    crear: escrituraProcedure
      .input(gastoRecurrenteInputSchema)
      .mutation(({ ctx, input }) => crearGastoRecurrente(ctx, input).catch(traducirError)),
    actualizar: escrituraProcedure
      .input(gastoRecurrenteActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const gasto = await actualizarGastoRecurrente(ctx, input).catch(traducirError);
        if (!gasto) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gasto recurrente no encontrado" });
        }
        return gasto;
      }),
  }),
});
