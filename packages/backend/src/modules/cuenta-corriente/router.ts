import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { withTenant } from "../../db/tenant-db.js";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import { fichaCliente, fichaProveedor } from "./fichas.js";
import { comprobantesAbiertos } from "./imputaciones.js";

const idSchema = z.object({ id: z.uuid() });

export const cuentaCorrienteRouter = router({
  /**
   * Lo que un cobro o un pago puede imputar: los comprobantes con algo
   * pendiente de la contraparte, más los que ese movimiento ya imputa.
   */
  abiertos: tenantProcedure
    .input(
      z.object({
        lado: z.enum(["ventas", "compras"]),
        contraparteId: z.uuid(),
        movimientoId: z.uuid().nullable().default(null),
      }),
    )
    .query(({ ctx, input }) =>
      withTenant(ctx.tenantId, (tx) =>
        comprobantesAbiertos(tx, input.lado, input.contraparteId, input.movimientoId),
      ),
    ),

  cliente: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const ficha = await fichaCliente(ctx, input.id);
    if (!ficha) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    return ficha;
  }),

  proveedor: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const ficha = await fichaProveedor(ctx, input.id);
    if (!ficha) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado" });
    }
    return ficha;
  }),
});
