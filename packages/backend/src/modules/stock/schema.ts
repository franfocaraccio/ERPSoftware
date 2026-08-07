import { z } from "zod";
import { ordenSchema } from "../_comunes/orden.js";

const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const cantidadSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, "Cantidad inválida (hasta 3 decimales)");

export const productoInputSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio").max(50),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(300),
  categoria: z.string().trim().max(100).optional(),
  costoUnitario: importeSchema.optional(),
  precioVenta: importeSchema.optional(),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  // Fase 1: carga manual (decisión de modelado, sin tabla de movimientos).
  stockActual: cantidadSchema.default("0"),
  stockMinimo: cantidadSchema.default("0"),
  proveedorPrincipalId: z.uuid().nullable().optional(),
});

export const productoActualizarSchema = z.object({
  id: z.uuid(),
  datos: productoInputSchema,
});

export const CAMPOS_ORDEN_STOCK = [
  "sku",
  "descripcion",
  "categoria",
  "costoUnitario",
  "precioVenta",
  "stockActual",
] as const;

export const productosListarSchema = z.object({
  busqueda: z.string().trim().max(100).optional(),
  soloReponer: z.boolean().default(false),
  categoria: z.string().trim().max(100).optional(),
  proveedorId: z.uuid().optional(),
  ...ordenSchema(CAMPOS_ORDEN_STOCK, "sku"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(20),
});

export type ProductoInput = z.infer<typeof productoInputSchema>;
export type ProductoActualizar = z.infer<typeof productoActualizarSchema>;
export type ProductosListar = z.infer<typeof productosListarSchema>;
