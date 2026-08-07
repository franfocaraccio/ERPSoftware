import { z } from "zod";
import { rangoFechasSchema } from "../_comunes/fechas.js";
import { ordenSchema } from "../_comunes/orden.js";

export const tiposImpuesto = ["iva", "iibb", "ganancias", "monotributo", "otros"] as const;

const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

export const impuestoInputSchema = z.object({
  tipo: z.enum(tiposImpuesto),
  // Período mensual: se guarda como el primer día del mes.
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Período inválido (YYYY-MM)"),
  baseImponible: importeSchema,
  alicuota: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, "Alícuota inválida")
    .refine((v) => Number(v) <= 100, "La alícuota no puede superar 100"),
  importePagado: importeSchema.default("0"),
  fechaVencimiento: fechaSchema,
});

export const impuestoActualizarSchema = z.object({
  id: z.uuid(),
  datos: impuestoInputSchema,
});

/**
 * No incluye el importe determinado ni el saldo: son derivados (base ×
 * alícuota, menos lo pagado) y no existen como columna. Ordenar por ellos
 * exigiría recalcularlos en SQL, duplicando la fórmula que vive en `core`.
 */
export const CAMPOS_ORDEN_IMPUESTOS = [
  "fechaVencimiento",
  "periodo",
  "tipo",
  "baseImponible",
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

export type ImpuestoInput = z.infer<typeof impuestoInputSchema>;
export type ImpuestoActualizar = z.infer<typeof impuestoActualizarSchema>;
export type ImpuestosListar = z.infer<typeof impuestosListarSchema>;
