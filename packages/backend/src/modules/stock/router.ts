import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import { productoActualizarSchema, productoInputSchema, productosListarSchema } from "./schema.js";
import { actualizarProducto, crearProducto, listarProductos, obtenerProducto } from "./service.js";

export const stockRouter = router({
  listar: tenantProcedure.input(productosListarSchema).query(({ ctx, input }) => {
    return listarProductos(ctx, input);
  }),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const producto = await obtenerProducto(ctx, input.id);
    if (!producto) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
    }
    return producto;
  }),

  crear: tenantProcedure.input(productoInputSchema).mutation(({ ctx, input }) => {
    return crearProducto(ctx, input);
  }),

  actualizar: tenantProcedure.input(productoActualizarSchema).mutation(async ({ ctx, input }) => {
    const producto = await actualizarProducto(ctx, input);
    if (!producto) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
    }
    return producto;
  }),
});
