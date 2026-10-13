import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { withTenant } from "../../db/tenant-db.js";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import { fichaCliente, fichaProveedor } from "./fichas.js";
import { comprobantesAbiertos } from "./imputaciones.js";
import { comprobantesPendientes } from "./pendientes.js";

const idSchema = z.object({ id: z.uuid() });

const pendientesSchema = z.object({
  soloVencidos: z.boolean().default(false),
  venceHasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)")
    .optional(),
});

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

  /** Lo que queda por cobrar de toda la empresa, comprobante por comprobante. */
  pendientesClientes: tenantProcedure
    .input(pendientesSchema)
    .query(({ ctx, input }) => comprobantesPendientes(ctx, "ventas", input)),

  /** Lo que queda por pagar a todos los proveedores. */
  pendientesProveedores: tenantProcedure
    .input(pendientesSchema)
    .query(({ ctx, input }) => comprobantesPendientes(ctx, "compras", input)),

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
