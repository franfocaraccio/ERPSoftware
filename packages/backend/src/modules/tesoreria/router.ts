import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import { ReferenciaAjenaError } from "../_comunes/pertenencia.js";
import { ImputacionInvalidaError } from "../cuenta-corriente/imputaciones.js";
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

/** Los errores de dominio llegan a la pantalla como un pedido inválido. */
function traducirError(error: unknown): never {
  if (error instanceof ImputacionInvalidaError || error instanceof ReferenciaAjenaError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

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
    crear: escrituraProcedure.input(cuentaInputSchema).mutation(({ ctx, input }) => {
      return crearCuenta(ctx, input);
    }),
    actualizar: escrituraProcedure
      .input(cuentaActualizarSchema)
      .mutation(async ({ ctx, input }) => {
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
    exportar: tenantProcedure
      .input(movimientosListarSchema)
      .query(({ ctx, input }) =>
        exportarListado(ctx, { tabla: "movimientos", filtros: input }, () =>
          listarMovimientos(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
        ),
      ),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const movimiento = await obtenerMovimiento(ctx, input.id);
      if (!movimiento) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Movimiento no encontrado" });
      }
      return movimiento;
    }),
    crear: escrituraProcedure.input(movimientoInputSchema).mutation(({ ctx, input }) => {
      return crearMovimiento(ctx, input).catch(traducirError);
    }),
    actualizar: escrituraProcedure
      .input(movimientoActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const movimiento = await actualizarMovimiento(ctx, input).catch(traducirError);
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
    exportar: tenantProcedure
      .input(chequesListarSchema)
      .query(({ ctx, input }) =>
        exportarListado(ctx, { tabla: "cheques", filtros: input }, () =>
          listarCheques(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
        ),
      ),
    obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const cheque = await obtenerCheque(ctx, input.id);
      if (!cheque) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cheque no encontrado" });
      }
      return cheque;
    }),
    crear: escrituraProcedure.input(chequeInputSchema).mutation(({ ctx, input }) => {
      return crearCheque(ctx, input);
    }),
    actualizar: escrituraProcedure
      .input(chequeActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const cheque = await actualizarCheque(ctx, input);
        if (!cheque) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cheque no encontrado" });
        }
        return cheque;
      }),
  }),
});
