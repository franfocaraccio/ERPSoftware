import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import { productoActualizarSchema, productoInputSchema, productosListarSchema } from "./schema.js";
import { actualizarProducto, crearProducto, listarProductos, obtenerProducto } from "./service.js";

export const stockRouter = router({
  listar: tenantProcedure.input(productosListarSchema).query(({ ctx, input }) => {
    return listarProductos(ctx, input);
  }),

  exportar: tenantProcedure
    .input(productosListarSchema)
    .query(({ ctx, input }) =>
      exportarListado(ctx, { tabla: "productos", filtros: input }, () =>
        listarProductos(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
      ),
    ),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const producto = await obtenerProducto(ctx, input.id);
    if (!producto) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
    }
    return producto;
  }),

  crear: escrituraProcedure.input(productoInputSchema).mutation(({ ctx, input }) => {
    return crearProducto(ctx, input);
  }),

  actualizar: escrituraProcedure
    .input(productoActualizarSchema)
    .mutation(async ({ ctx, input }) => {
      const producto = await actualizarProducto(ctx, input);
      if (!producto) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
      }
      return producto;
    }),
});
