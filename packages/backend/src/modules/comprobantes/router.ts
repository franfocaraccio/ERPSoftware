import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import {
  compraActualizarSchema,
  compraInputSchema,
  comprasListarSchema,
  ventaActualizarSchema,
  ventaInputSchema,
  ventasListarSchema,
  ventaTransicionSchema,
} from "./schema.js";
import {
  actualizarCompra,
  actualizarVenta,
  ComprobanteInmutableError,
  crearCompra,
  crearVenta,
  listarCompras,
  listarVentas,
  obtenerCompra,
  obtenerVenta,
  TransicionInvalidaError,
  transicionarVenta,
} from "./service.js";

const idSchema = z.object({ id: z.uuid() });

/** Los errores de dominio se traducen a códigos tRPC semánticos. */
function traducirError(error: unknown): never {
  if (error instanceof ComprobanteInmutableError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof TransicionInvalidaError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const comprobantesRouter = router({
  ventas: router({
    listar: tenantProcedure.input(ventasListarSchema).query(({ ctx, input }) => {
      return listarVentas(ctx, input);
    }),
    exportar: tenantProcedure
      .input(ventasListarSchema)
      .query(({ ctx, input }) =>
        exportarListado(ctx, { tabla: "comprobantes_venta", filtros: input }, () =>
          listarVentas(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
        ),
      ),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const venta = await obtenerVenta(ctx, input.id);
      if (!venta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comprobante no encontrado" });
      }
      return venta;
    }),
    crear: escrituraProcedure.input(ventaInputSchema).mutation(({ ctx, input }) => {
      return crearVenta(ctx, input);
    }),
    actualizar: escrituraProcedure.input(ventaActualizarSchema).mutation(async ({ ctx, input }) => {
      const venta = await actualizarVenta(ctx, input).catch(traducirError);
      if (!venta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comprobante no encontrado" });
      }
      return venta;
    }),
    transicionar: escrituraProcedure
      .input(ventaTransicionSchema)
      .mutation(async ({ ctx, input }) => {
        const venta = await transicionarVenta(ctx, input).catch(traducirError);
        if (!venta) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comprobante no encontrado" });
        }
        return venta;
      }),
  }),

  compras: router({
    listar: tenantProcedure.input(comprasListarSchema).query(({ ctx, input }) => {
      return listarCompras(ctx, input);
    }),
    exportar: tenantProcedure
      .input(comprasListarSchema)
      .query(({ ctx, input }) =>
        exportarListado(ctx, { tabla: "comprobantes_compra", filtros: input }, () =>
          listarCompras(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
        ),
      ),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const compra = await obtenerCompra(ctx, input.id);
      if (!compra) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Compra no encontrada" });
      }
      return compra;
    }),
    crear: escrituraProcedure.input(compraInputSchema).mutation(({ ctx, input }) => {
      return crearCompra(ctx, input);
    }),
    actualizar: escrituraProcedure
      .input(compraActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const compra = await actualizarCompra(ctx, input);
        if (!compra) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Compra no encontrada" });
        }
        return compra;
      }),
  }),
});
