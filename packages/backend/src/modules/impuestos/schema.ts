import { z } from "zod";
import { rangoFechasSchema } from "../_comunes/fechas.js";
import { ordenSchema } from "../_comunes/orden.js";

export const tiposImpuesto = ["iva", "iibb", "ganancias", "monotributo", "otros"] as const;

/** Qué impuestos corresponden a cada régimen. Lo demás no se ofrece ni se acepta. */
export const TIPOS_POR_REGIMEN = {
  responsable_inscripto: ["iva", "iibb", "ganancias", "otros"],
  monotributo: ["monotributo", "iibb", "otros"],
} as const satisfies Record<string, readonly (typeof tiposImpuesto)[number][]>;

const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const periodoSchema = z.string().regex(/^\d{4}-\d{2}$/, "Período inválido (YYYY-MM)");

const alicuotaSchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Alícuota inválida")
  .refine((v) => Number(v) <= 100, "La alícuota no puede superar 100");

/**
 * Una obligación se determina de una de tres formas, según su tipo:
 *
 * - IVA: no se carga lo determinado. Sale de la posición que calcula el
 *   sistema con los comprobantes; acá sólo se registra el pago del período.
 * - Ganancias y Monotributo: importe fijo (un anticipo, una cuota), el que
 *   informa ARCA o el contador.
 * - IIBB y Otros: base × alícuota, o importe fijo.
 */
export const impuestoInputSchema = z
  .object({
    tipo: z.enum(tiposImpuesto),
    // Período mensual: se guarda como el primer día del mes.
    periodo: periodoSchema,
    concepto: z.string().trim().max(100).optional(),
    baseImponible: importeSchema.nullable().optional(),
    alicuota: alicuotaSchema.nullable().optional(),
    importeFijo: importeSchema.nullable().optional(),
    importePagado: importeSchema.default("0"),
    fechaVencimiento: fechaSchema,
  })
  .superRefine((v, ctx) => {
    const conBase = Boolean(v.baseImponible) && Boolean(v.alicuota);
    const conFijo = Boolean(v.importeFijo);
    if (v.tipo === "iva") {
      if (conBase || conFijo) {
        ctx.addIssue({
          code: "custom",
          path: ["tipo"],
          message: "El IVA lo calcula el sistema con los comprobantes: sólo se registra el pago.",
        });
      }
      return;
    }
    if ((v.tipo === "ganancias" || v.tipo === "monotributo") && !conFijo) {
      ctx.addIssue({
        code: "custom",
        path: ["importeFijo"],
        message: "Cargá el importe que informó ARCA o el contador.",
      });
      return;
    }
    if (conBase === conFijo) {
      ctx.addIssue({
        code: "custom",
        path: ["importeFijo"],
        message: "Cargá base y alícuota, o un importe fijo (una de las dos).",
      });
    }
  });

export const impuestoActualizarSchema = z.object({
  id: z.uuid(),
  datos: impuestoInputSchema,
});

export const CAMPOS_ORDEN_IMPUESTOS = [
  "fechaVencimiento",
  "periodo",
  "tipo",
  "importeDeterminado",
] as const;

/**
 * Impuestos tiene dos fechas que sirven para distinto: el vencimiento manda
 * para no comerse un recargo, el período para cerrar un ejercicio. El rango
 * aplica sobre la que elija quien consulta.
 */
export const CAMPOS_FECHA_IMPUESTOS = ["fechaVencimiento", "periodo"] as const;

export const impuestosListarSchema = z.object({
  tipo: z.enum(tiposImpuesto).optional(),
  soloImpagos: z.boolean().default(false),
  campoFecha: z.enum(CAMPOS_FECHA_IMPUESTOS).default("fechaVencimiento"),
  ...rangoFechasSchema,
  ...ordenSchema(CAMPOS_ORDEN_IMPUESTOS, "fechaVencimiento", "desc"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(20),
});

/** Retenciones, percepciones y SIRCREB de IIBB sufridas. */
export const retencionInputSchema = z.object({
  fecha: fechaSchema,
  periodo: periodoSchema,
  tipo: z.enum(["retencion", "percepcion", "sircreb"]),
  agente: z.string().trim().max(200).optional(),
  comprobante: z.string().trim().max(100).optional(),
  importe: importeSchema.refine((v) => Number(v) > 0, "El importe tiene que ser mayor a cero"),
});

export const retencionActualizarSchema = z.object({
  id: z.uuid(),
  datos: retencionInputSchema,
});

export type ImpuestoInput = z.infer<typeof impuestoInputSchema>;
export type ImpuestoActualizar = z.infer<typeof impuestoActualizarSchema>;
export type ImpuestosListar = z.infer<typeof impuestosListarSchema>;
export type RetencionInput = z.infer<typeof retencionInputSchema>;
export type RetencionActualizar = z.infer<typeof retencionActualizarSchema>;
