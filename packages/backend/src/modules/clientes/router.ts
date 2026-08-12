import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import { clienteActualizarSchema, clienteInputSchema, clientesListarSchema } from "./schema.js";
import { actualizarCliente, crearCliente, listarClientes, obtenerCliente } from "./service.js";

export const clientesRouter = router({
  listar: tenantProcedure.input(clientesListarSchema).query(({ ctx, input }) => {
    return listarClientes(ctx, input);
  }),

  exportar: tenantProcedure
    .input(clientesListarSchema)
    .query(({ ctx, input }) =>
      exportarListado(ctx, { tabla: "clientes", filtros: input }, () =>
        listarClientes(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
      ),
    ),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const cliente = await obtenerCliente(ctx, input.id);
    if (!cliente) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    return cliente;
  }),

  crear: escrituraProcedure.input(clienteInputSchema).mutation(({ ctx, input }) => {
    return crearCliente(ctx, input);
  }),

  actualizar: escrituraProcedure.input(clienteActualizarSchema).mutation(async ({ ctx, input }) => {
    const cliente = await actualizarCliente(ctx, input);
    if (!cliente) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    return cliente;
  }),
});
