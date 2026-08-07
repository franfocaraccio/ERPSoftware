import { z } from "zod";

/**
 * Umbrales que la especificación define como "definidos por el cliente". Cada
 * empresa tiene los suyos y de ellos dependen los semáforos del panel.
 *
 * Los valores decimales viajan como string: son `numeric` en la base y se
 * operan con `Money` en el dominio. Convertirlos a `number` en el borde
 * introduce el error de punto flotante que el proyecto evita en todos lados.
 */
const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const porcentajeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Porcentaje inválido (usar punto decimal, máximo 2 decimales)")
  .refine((v) => Number(v) <= 100, "El margen no puede superar 100%");

export const parametrosGuardarSchema = z.object({
  /** Días de mora a partir de los cuales el DSO pasa a rojo en el panel. */
  umbralMoraDias: z.number().int().min(1, "Tiene que ser al menos 1 día").max(365),
  /** Margen bruto objetivo, en porcentaje. Vacío = sin objetivo definido. */
  margenObjetivo: porcentajeSchema.nullable(),
  /** Piso de caja de la proyección a 13 semanas, en pesos. Vacío = sin piso. */
  minimoOperativo: importeSchema.nullable(),
});

export type ParametrosGuardar = z.infer<typeof parametrosGuardarSchema>;
