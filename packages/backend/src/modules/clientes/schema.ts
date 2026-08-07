import { normalizarCuit, validarCuit } from "@erp/core/tax";
import { z } from "zod";
import { ordenSchema } from "../_comunes/orden.js";

export const condicionesIva = [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
] as const;

export const estadosCliente = ["activo", "inactivo", "en_mora"] as const;

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
    estado: z.enum(estadosCliente),
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

export type ClienteInput = z.infer<typeof clienteInputSchema>;
export type ClienteActualizar = z.infer<typeof clienteActualizarSchema>;
export type ClientesListar = z.infer<typeof clientesListarSchema>;
