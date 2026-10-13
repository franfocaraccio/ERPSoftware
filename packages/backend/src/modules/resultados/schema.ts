import { z } from "zod";

const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

export const categoriaInputSchema = z.object({
  nombre: z.string().trim().min(1, "Poné un nombre").max(80),
  tipo: z.enum(["gasto", "ingreso"]),
  activa: z.boolean().default(true),
});

export const categoriaActualizarSchema = z.object({
  id: z.uuid(),
  datos: categoriaInputSchema,
});

export const gastoRecurrenteInputSchema = z
  .object({
    descripcion: z.string().trim().min(1, "Poné una descripción").max(120),
    categoriaId: z.uuid().nullable().default(null),
    cuentaId: z.uuid(),
    importe: importeSchema.refine((v) => Number(v) > 0, "Tiene que ser mayor a cero"),
    diaDelMes: z.number().int().min(1).max(31),
    desde: fechaSchema,
    hasta: fechaSchema.nullable().default(null),
    activo: z.boolean().default(true),
  })
  .refine((g) => g.hasta === null || g.hasta >= g.desde, {
    message: "La fecha de fin no puede ser anterior al inicio",
    path: ["hasta"],
  });

export const gastoRecurrenteActualizarSchema = z.object({
  id: z.uuid(),
  datos: gastoRecurrenteInputSchema,
});

export const estadoResultadosSchema = z.object({
  /** Cuántos meses mostrar, terminando en el mes en curso. */
  meses: z.number().int().min(1).max(24).default(12),
});

export const rentabilidadSchema = z.object({
  agrupar: z.enum(["cliente", "producto", "categoria"]),
  desde: fechaSchema,
  hasta: fechaSchema,
});

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;
export type CategoriaActualizar = z.infer<typeof categoriaActualizarSchema>;
export type GastoRecurrenteInput = z.infer<typeof gastoRecurrenteInputSchema>;
export type GastoRecurrenteActualizar = z.infer<typeof gastoRecurrenteActualizarSchema>;
export type RentabilidadInput = z.infer<typeof rentabilidadSchema>;
