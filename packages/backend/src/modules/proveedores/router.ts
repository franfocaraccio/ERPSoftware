import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import {
  proveedorActualizarSchema,
  proveedoresListarSchema,
  proveedoresResumenSchema,
  proveedorInputSchema,
} from "./schema.js";
import {
  actualizarProveedor,
  crearProveedor,
  listarProveedores,
  obtenerProveedor,
  resumenProveedores,
} from "./service.js";

export const proveedoresRouter = router({
  listar: tenantProcedure.input(proveedoresListarSchema).query(({ ctx, input }) => {
    return listarProveedores(ctx, input);
  }),

  /** Total a pagar y concentración de la cartera, para la tarjeta de arriba. */
  resumen: tenantProcedure.input(proveedoresResumenSchema).query(({ ctx, input }) => {
    return resumenProveedores(ctx, input);
  }),

  exportar: tenantProcedure
    .input(proveedoresListarSchema)
    .query(({ ctx, input }) =>
      exportarListado(ctx, { tabla: "proveedores", filtros: input }, () =>
        listarProveedores(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
      ),
    ),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const proveedor = await obtenerProveedor(ctx, input.id);
    if (!proveedor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado" });
    }
    return proveedor;
  }),

  crear: escrituraProcedure.input(proveedorInputSchema).mutation(({ ctx, input }) => {
    return crearProveedor(ctx, input);
  }),

  actualizar: escrituraProcedure
    .input(proveedorActualizarSchema)
    .mutation(async ({ ctx, input }) => {
      const proveedor = await actualizarProveedor(ctx, input);
      if (!proveedor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado" });
      }
      return proveedor;
    }),
});
