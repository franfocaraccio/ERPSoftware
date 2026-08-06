import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import {
  proveedorActualizarSchema,
  proveedoresListarSchema,
  proveedorInputSchema,
} from "./schema.js";
import {
  actualizarProveedor,
  crearProveedor,
  listarProveedores,
  obtenerProveedor,
} from "./service.js";

export const proveedoresRouter = router({
  listar: tenantProcedure.input(proveedoresListarSchema).query(({ ctx, input }) => {
    return listarProveedores(ctx, input);
  }),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const proveedor = await obtenerProveedor(ctx, input.id);
    if (!proveedor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado" });
    }
    return proveedor;
  }),

  crear: tenantProcedure.input(proveedorInputSchema).mutation(({ ctx, input }) => {
    return crearProveedor(ctx, input);
  }),

  actualizar: tenantProcedure.input(proveedorActualizarSchema).mutation(async ({ ctx, input }) => {
    const proveedor = await actualizarProveedor(ctx, input);
    if (!proveedor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado" });
    }
    return proveedor;
  }),
});
