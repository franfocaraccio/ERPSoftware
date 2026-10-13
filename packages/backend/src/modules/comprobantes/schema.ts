import { ESTADOS_COMPROBANTE } from "@erp/core/invoicing";
import { z } from "zod";
import type { estadoComprobanteEnum } from "../../db/schema/facturacion.js";
import { rangoFechasSchema } from "../_comunes/fechas.js";
import { ordenSchema } from "../_comunes/orden.js";

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

export const CAMPOS_ORDEN_VENTAS = ["fechaEmision", "numero", "total", "estado"] as const;

export const ventasListarSchema = z.object({
  estado: z.enum(ESTADOS_COMPROBANTE).optional(),
  clienteId: z.uuid().optional(),
  ...rangoFechasSchema,
  ...ordenSchema(CAMPOS_ORDEN_VENTAS, "fechaEmision", "desc"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(50),
});

// --- Comprobantes de compra ---

const compraBaseSchema = z.object({
  proveedorId: z.uuid(),
  letra: z.enum(["A", "B", "C", "E"]).nullable().optional(),
  numeroCompleto: z.string().trim().max(30).optional(),
  fechaEmision: fecha.optional(),
  fechaRecepcion: fecha,
  condicionPagoDias: z.number().int().min(0).max(365).default(0),
  concepto: z.string().trim().max(300).optional(),
  /**
   * Null = mercadería para stock. Con categoría, la compra es un gasto (un
   * flete, un honorario) y entra en el estado de resultados.
   */
  categoriaId: z.uuid().nullable().optional(),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  neto: importe.default("0"),
  iva: importe.default("0"),
  total: importe,
  /**
   * De qué archivo salió, cuando vino de la lectura automática.
   *
   * El archivo no se guarda: queda el nombre y el SHA-256, que alcanzan para
   * reconocer que un comprobante ya se cargó desde ese mismo papel sin tener
   * que conservarlo. Va al audit log, no a una columna.
   */
  origenArchivo: z
    .object({
      nombre: z.string().trim().min(1).max(255),
      hash: z.string().regex(/^[0-9a-f]{64}$/, "Hash inválido"),
    })
    .optional(),
});

/**
 * Lo que trajo una compra de mercadería. Suma stock y recalcula el costo de
 * cada producto por promedio ponderado. El costo unitario va neto de IVA.
 */
const itemCompraSchema = z.object({
  productoId: z.uuid(),
  descripcion: z.string().trim().min(1).max(300),
  cantidad: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida")
    .refine((v) => Number(v) > 0, "La cantidad tiene que ser mayor a cero"),
  costoUnitario: importe,
});

export const compraInputSchema = compraBaseSchema
  .extend({ items: z.array(itemCompraSchema).max(200).default([]) })
  .refine((c) => c.items.length === 0 || !c.categoriaId, {
    message: "Una compra de servicios (con categoría de gasto) no lleva productos",
    path: ["items"],
  })
  .refine((c) => c.items.length === 0 || c.moneda === "ARS", {
    message: "Los productos se compran en pesos: el costo del stock es en pesos",
    path: ["items"],
  });

/**
 * Editar una compra no toca sus ítems: ya movieron stock y costo. Si están
 * mal, se corrige con un ajuste de stock.
 */
export const compraActualizarSchema = z.object({
  id: z.uuid(),
  datos: compraBaseSchema,
});

/** El rango cae sobre la fecha de recepción: es obligatoria, así que ninguna
 *  fila queda invisible al filtrar. La de emisión la pone el proveedor y puede
 *  faltar. */
export const CAMPOS_ORDEN_COMPRAS = ["fechaRecepcion", "numeroCompleto", "total"] as const;

export const comprasListarSchema = z.object({
  proveedorId: z.uuid().optional(),
  ...rangoFechasSchema,
  ...ordenSchema(CAMPOS_ORDEN_COMPRAS, "fechaRecepcion", "desc"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(50),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type ItemCompraInput = z.infer<typeof itemCompraSchema>;
export type VentaInput = z.infer<typeof ventaInputSchema>;
export type VentaActualizar = z.infer<typeof ventaActualizarSchema>;
export type VentaTransicion = z.infer<typeof ventaTransicionSchema>;
export type VentasListar = z.infer<typeof ventasListarSchema>;
/** Lo que recibe el service: sin ítems es una compra que no mueve stock. */
export type CompraInput = Omit<z.infer<typeof compraInputSchema>, "items"> & {
  items?: ItemCompraInput[];
};
export type CompraActualizar = z.infer<typeof compraActualizarSchema>;
export type ComprasListar = z.infer<typeof comprasListarSchema>;
