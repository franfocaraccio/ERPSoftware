import { z } from "zod";

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

export const impuestosListarSchema = z.object({
  tipo: z.enum(tiposImpuesto).optional(),
  soloImpagos: z.boolean().default(false),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(20),
});

export type ImpuestoInput = z.infer<typeof impuestoInputSchema>;
export type ImpuestoActualizar = z.infer<typeof impuestoActualizarSchema>;
export type ImpuestosListar = z.infer<typeof impuestosListarSchema>;
