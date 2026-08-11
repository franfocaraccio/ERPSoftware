import { normalizarCuit, validarCuit } from "@erp/core/tax";
import { z } from "zod";
import { rangoFechasSchema } from "../_comunes/fechas.js";
import { ordenSchema } from "../_comunes/orden.js";

export const condicionesIva = [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
] as const;

const cuitSchema = z
  .string()
  .trim()
  .refine(validarCuit, "CUIT inválido (verificá los 11 dígitos)")
  .transform(normalizarCuit);

export const proveedorInputSchema = z.object({
  razonSocial: z.string().trim().min(1, "La razón social es obligatoria").max(200),
  cuit: cuitSchema.optional(),
  condicionIva: z.enum(condicionesIva),
  rubro: z.string().trim().max(100).optional(),
  // Plazo de pago pactado: base de la proyección de egresos.
  condicionPagoDias: z.number().int().min(0).max(365).default(0),
  cbu: z
    .string()
    .trim()
    .regex(/^\d{22}$/, "El CBU tiene 22 dígitos")
    .optional(),
  aliasCbu: z.string().trim().max(50).optional(),
  email: z.email("Email inválido").optional(),
  telefono: z.string().trim().max(50).optional(),
});

export const proveedorActualizarSchema = z.object({
  id: z.uuid(),
  datos: proveedorInputSchema,
});

export const CAMPOS_ORDEN_PROVEEDORES = [
  "razonSocial",
  "cuit",
  "condicionIva",
  "rubro",
  "condicionPagoDias",
] as const;

export const proveedoresListarSchema = z.object({
  busqueda: z.string().trim().max(100).optional(),
  condicionIva: z.enum(condicionesIva).optional(),
  // El rango filtra por próximo vencimiento, que es el dato fechado que la
  // tabla muestra. No es una columna del proveedor: se calcula sobre sus
  // comprobantes de compra.
  ...rangoFechasSchema,
  ...ordenSchema(CAMPOS_ORDEN_PROVEEDORES, "razonSocial"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(20),
});

export type ProveedorInput = z.infer<typeof proveedorInputSchema>;
export type ProveedorActualizar = z.infer<typeof proveedorActualizarSchema>;
export type ProveedoresListar = z.infer<typeof proveedoresListarSchema>;
