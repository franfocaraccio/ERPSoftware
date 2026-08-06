import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import { clienteActualizarSchema, clienteInputSchema, clientesListarSchema } from "./schema.js";
import { actualizarCliente, crearCliente, listarClientes, obtenerCliente } from "./service.js";

export const clientesRouter = router({
  listar: tenantProcedure.input(clientesListarSchema).query(({ ctx, input }) => {
    return listarClientes(ctx, input);
  }),

  obtener: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const cliente = await obtenerCliente(ctx, input.id);
    if (!cliente) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    return cliente;
  }),

  crear: tenantProcedure.input(clienteInputSchema).mutation(({ ctx, input }) => {
    return crearCliente(ctx, input);
  }),

  actualizar: tenantProcedure.input(clienteActualizarSchema).mutation(async ({ ctx, input }) => {
    const cliente = await actualizarCliente(ctx, input);
    if (!cliente) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    return cliente;
  }),
});
