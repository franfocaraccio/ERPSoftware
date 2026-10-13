import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { escrituraProcedure, router, tenantProcedure } from "../../trpc/trpc.js";
import { exportarListado, TOPE_FILAS_EXPORT } from "../_comunes/exportar.js";
import {
  impuestoActualizarSchema,
  impuestoInputSchema,
  impuestosListarSchema,
  retencionActualizarSchema,
  retencionInputSchema,
} from "./schema.js";
import {
  actualizarImpuesto,
  actualizarRetencion,
  crearImpuesto,
  crearRetencion,
  eliminarRetencion,
  ImpuestoInvalidoError,
  listarImpuestos,
  listarRetenciones,
  obtenerImpuesto,
  obtenerPosicionIva,
} from "./service.js";

const idSchema = z.object({ id: z.uuid() });

function traducirError(error: unknown): never {
  if (error instanceof ImpuestoInvalidoError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const impuestosRouter = router({
  listar: tenantProcedure.input(impuestosListarSchema).query(({ ctx, input }) => {
    return listarImpuestos(ctx, input);
  }),

  exportar: tenantProcedure
    .input(impuestosListarSchema)
    .query(({ ctx, input }) =>
      exportarListado(ctx, { tabla: "impuestos", filtros: input }, () =>
        listarImpuestos(ctx, { ...input, pagina: 1, tamanoPagina: TOPE_FILAS_EXPORT }),
      ),
    ),

  /** De dónde sale el IVA calculado: débito, crédito y saldo a favor por mes. */
  posicionIva: tenantProcedure.query(({ ctx }) => obtenerPosicionIva(ctx)),

  obtener: tenantProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const impuesto = await obtenerImpuesto(ctx, input.id);
    if (!impuesto) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Obligación no encontrada" });
    }
    return impuesto;
  }),

  crear: escrituraProcedure.input(impuestoInputSchema).mutation(({ ctx, input }) => {
    return crearImpuesto(ctx, input).catch(traducirError);
  }),

  actualizar: escrituraProcedure
    .input(impuestoActualizarSchema)
    .mutation(async ({ ctx, input }) => {
      const impuesto = await actualizarImpuesto(ctx, input).catch(traducirError);
      if (!impuesto) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Obligación no encontrada" });
      }
      return impuesto;
    }),

  retenciones: router({
    listar: tenantProcedure.query(({ ctx }) => listarRetenciones(ctx)),
    crear: escrituraProcedure
      .input(retencionInputSchema)
      .mutation(({ ctx, input }) => crearRetencion(ctx, input)),
    actualizar: escrituraProcedure
      .input(retencionActualizarSchema)
      .mutation(async ({ ctx, input }) => {
        const retencion = await actualizarRetencion(ctx, input);
        if (!retencion) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Retención no encontrada" });
        }
        return retencion;
      }),
    eliminar: escrituraProcedure.input(idSchema).mutation(async ({ ctx, input }) => {
      if (!(await eliminarRetencion(ctx, input.id))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Retención no encontrada" });
      }
      return { ok: true };
    }),
  }),
});
