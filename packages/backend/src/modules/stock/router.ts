import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import { ajustarStock, movimientosDeProducto, StockInvalidoError } from "./movimientos.js";
import { agruparPorProveedor, sugerenciasDeCompra } from "./reposicion.js";
import { productoActualizarSchema, productoInputSchema, productosListarSchema } from "./schema.js";
import { actualizarProducto, crearProducto, listarProductos, obtenerProducto } from "./service.js";

const cantidadConSigno = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,3})?$/, "Cantidad inválida: hasta 3 decimales, con signo para restar")
  .refine((v) => !/^-?0+(\.0+)?$/.test(v), "La cantidad no puede ser cero");

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

  /** Qué comprar para lo marcado "Reponer", y a qué costo. */
  reposicion: tenantProcedure.query(async ({ ctx }) =>
    agruparPorProveedor(await sugerenciasDeCompra(ctx)),
  ),

  /** La historia de un producto: cada entrada y salida. */
  movimientos: tenantProcedure
    .input(z.object({ productoId: z.uuid() }))
    .query(({ ctx, input }) => movimientosDeProducto(ctx, input.productoId)),

  /** Corregir el stock a mano, siempre con un motivo. */
  ajustar: escrituraProcedure
    .input(
      z.object({
        productoId: z.uuid(),
        cantidad: cantidadConSigno,
        motivo: z.string().trim().min(1, "Decí por qué: un conteo, una rotura").max(200),
      }),
    )
    .mutation(({ ctx, input }) =>
      ajustarStock(ctx, input).catch((error: unknown) => {
        if (error instanceof StockInvalidoError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }),
    ),
});
