import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/trpc.js";
import {
  chequeActualizarSchema,
  chequeInputSchema,
  chequesListarSchema,
  cuentaActualizarSchema,
  cuentaInputSchema,
  movimientoActualizarSchema,
  movimientoInputSchema,
  movimientosListarSchema,
} from "./schema.js";
import {
  actualizarCheque,
  actualizarCuenta,
  actualizarMovimiento,
  crearCheque,
  crearCuenta,
  crearMovimiento,
  listarCheques,
  listarCuentas,
  listarMovimientos,
  obtenerCheque,
  obtenerCuenta,
  obtenerMovimiento,
} from "./service.js";

const idSchema = z.object({ id: z.uuid() });

export const tesoreriaRouter = router({
  cuentas: router({
    listar: tenantProcedure.query(({ ctx }) => listarCuentas(ctx)),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const cuenta = await obtenerCuenta(ctx, input.id);
      if (!cuenta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cuenta no encontrada" });
      }
      return cuenta;
    }),
    crear: tenantProcedure.input(cuentaInputSchema).mutation(({ ctx, input }) => {
      return crearCuenta(ctx, input);
    }),
    actualizar: tenantProcedure.input(cuentaActualizarSchema).mutation(async ({ ctx, input }) => {
      const cuenta = await actualizarCuenta(ctx, input);
      if (!cuenta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cuenta no encontrada" });
      }
      return cuenta;
    }),
  }),

  movimientos: router({
    listar: tenantProcedure.input(movimientosListarSchema).query(({ ctx, input }) => {
      return listarMovimientos(ctx, input);
    }),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const movimiento = await obtenerMovimiento(ctx, input.id);
      if (!movimiento) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Movimiento no encontrado" });
      }
      return movimiento;
    }),
    crear: tenantProcedure.input(movimientoInputSchema).mutation(({ ctx, input }) => {
      return crearMovimiento(ctx, input);
    }),
    actualizar: tenantProcedure
      .input(movimientoActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const movimiento = await actualizarMovimiento(ctx, input);
        if (!movimiento) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Movimiento no encontrado" });
        }
        return movimiento;
      }),
  }),

  cheques: router({
    listar: tenantProcedure.input(chequesListarSchema).query(({ ctx, input }) => {
      return listarCheques(ctx, input);
    }),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const cheque = await obtenerCheque(ctx, input.id);
      if (!cheque) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cheque no encontrado" });
      }
      return cheque;
    }),
    crear: tenantProcedure.input(chequeInputSchema).mutation(({ ctx, input }) => {
      return crearCheque(ctx, input);
    }),
    actualizar: tenantProcedure.input(chequeActualizarSchema).mutation(async ({ ctx, input }) => {
      const cheque = await actualizarCheque(ctx, input);
      if (!cheque) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cheque no encontrado" });
      }
      return cheque;
    }),
  }),
});
