import { normalizarCuit, validarCuit } from "@erp/core/tax";
import { z } from "zod";
import { ordenSchema } from "../_comunes/orden.js";

export const condicionesIva = [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
] as const;

/** Los estados por los que se puede filtrar. "En mora" se calcula, no se guarda. */
export const estadosCliente = ["activo", "inactivo", "en_mora"] as const;

/**
 * Los que se cargan a mano. La mora dejó de marcarse a mano el 12/10/2026: un
 * cliente está en mora si tiene deuda vencida hace más que el umbral de
 * Parámetros, y eso lo calcula el sistema.
 */
export const estadosEditables = ["activo", "inactivo"] as const;

const importeSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const cuitSchema = z
  .string()
  .trim()
  .refine(validarCuit, "CUIT inválido (verificá los 11 dígitos)")
  .transform(normalizarCuit);

export const clienteInputSchema = z.object({
  razonSocial: z.string().trim().min(1, "La razón social es obligatoria").max(200),
  cuit: cuitSchema.optional(),
  condicionIva: z.enum(condicionesIva),
  email: z.email("Email inválido").optional(),
  telefono: z.string().trim().max(50).optional(),
  direccion: z.string().trim().max(300).optional(),
  limiteCredito: importeSchema.optional(),
});

export const clienteActualizarSchema = z.object({
  id: z.uuid(),
  datos: clienteInputSchema.extend({
    estado: z.enum(estadosEditables),
  }),
});

export const CAMPOS_ORDEN_CLIENTES = [
  "razonSocial",
  "cuit",
  "condicionIva",
  "limiteCredito",
  "estado",
] as const;

export const clientesListarSchema = z.object({
  busqueda: z.string().trim().max(100).optional(),
  condicionIva: z.enum(condicionesIva).optional(),
  estado: z.enum(estadosCliente).optional(),
  ...ordenSchema(CAMPOS_ORDEN_CLIENTES, "razonSocial"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(20),
});

/**
 * Los mismos filtros del listado, sin paginación ni orden: el resumen de arriba
 * mira todos los clientes que matchean, no la página que se está viendo.
 */
export const clientesResumenSchema = z.object({
  busqueda: z.string().trim().max(100).optional(),
  condicionIva: z.enum(condicionesIva).optional(),
  estado: z.enum(estadosCliente).optional(),
});

export type ClienteInput = z.infer<typeof clienteInputSchema>;
export type ClienteActualizar = z.infer<typeof clienteActualizarSchema>;
export type ClientesListar = z.infer<typeof clientesListarSchema>;
