import { ESTADOS_COMPROBANTE } from "@erp/core/invoicing";
import { z } from "zod";
import type { estadoComprobanteEnum } from "../../db/schema/facturacion.js";

/**
 * Paridad en tiempo de compilación entre el pgEnum de Drizzle (fuente de
 * verdad) y los estados de la máquina en core. Si alguien agrega un estado en
 * la migración y se olvida de la máquina (o al revés), esto no compila.
 */
type EstadosDb = (typeof estadoComprobanteEnum.enumValues)[number];
type EstadosMaquina = (typeof ESTADOS_COMPROBANTE)[number];
type Equivale<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _paridadEstados: Equivale<EstadosDb, EstadosMaquina> = true;
void _paridadEstados;

const importe = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

const cantidad = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida (hasta 3 decimales)")
  .refine((v) => Number(v) > 0, "La cantidad debe ser mayor a cero");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

export const alicuotasIva = ["0", "2.5", "5", "10.5", "21", "27", "exento", "no_gravado"] as const;

export const itemInputSchema = z.object({
  productoId: z.uuid().nullable().optional(),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(300),
  cantidad,
  precioUnitario: importe,
  alicuotaIva: z.enum(alicuotasIva),
});

// --- Comprobantes de venta ---

export const ventaInputSchema = z.object({
  clase: z.enum(["factura", "nota_credito", "nota_debito"]).default("factura"),
  puntoVenta: z.number().int().min(1).max(99999),
  // Fase 1: carga manual. En Fase 3 lo asigna el proceso de emisión contra ARCA.
  numero: z.number().int().min(1).nullable().optional(),
  clienteId: z.uuid(),
  fechaEmision: fecha,
  condicionVentaDias: z.number().int().min(0).max(365).default(0),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  items: z.array(itemInputSchema).min(1, "Cargá al menos un ítem"),
});

export const ventaActualizarSchema = z.object({
  id: z.uuid(),
  datos: ventaInputSchema,
});

export const ventaTransicionSchema = z.object({
  id: z.uuid(),
  evento: z.enum(["emitir", "aprobar", "rechazar", "corregir"]),
});

export const ventasListarSchema = z.object({
  estado: z.enum(ESTADOS_COMPROBANTE).optional(),
  clienteId: z.uuid().optional(),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(50),
});

// --- Comprobantes de compra ---

export const compraInputSchema = z.object({
  proveedorId: z.uuid(),
  letra: z.enum(["A", "B", "C", "E"]).nullable().optional(),
  numeroCompleto: z.string().trim().max(30).optional(),
  fechaEmision: fecha.optional(),
  fechaRecepcion: fecha,
  condicionPagoDias: z.number().int().min(0).max(365).default(0),
  concepto: z.string().trim().max(300).optional(),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  neto: importe.default("0"),
  iva: importe.default("0"),
  total: importe,
});

export const compraActualizarSchema = z.object({
  id: z.uuid(),
  datos: compraInputSchema,
});

export const comprasListarSchema = z.object({
  proveedorId: z.uuid().optional(),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(50),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type VentaInput = z.infer<typeof ventaInputSchema>;
export type VentaActualizar = z.infer<typeof ventaActualizarSchema>;
export type VentaTransicion = z.infer<typeof ventaTransicionSchema>;
export type VentasListar = z.infer<typeof ventasListarSchema>;
export type CompraInput = z.infer<typeof compraInputSchema>;
export type CompraActualizar = z.infer<typeof compraActualizarSchema>;
export type ComprasListar = z.infer<typeof comprasListarSchema>;
