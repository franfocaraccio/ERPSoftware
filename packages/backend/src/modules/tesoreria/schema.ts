import { z } from "zod";
import { ordenSchema } from "../_comunes/orden.js";

export const tiposMovimiento = ["ingreso", "egreso"] as const;

const importePositivo = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)")
  .refine((v) => Number(v) > 0, "El importe debe ser mayor a cero");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

// --- Cuentas ---

export const cuentaInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  tipo: z.enum(["efectivo", "cuenta_corriente", "caja_ahorro"]),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
});

export const cuentaActualizarSchema = z.object({
  id: z.uuid(),
  datos: cuentaInputSchema,
});

// --- Movimientos ---

export const movimientoInputSchema = z
  .object({
    fecha,
    cuentaId: z.uuid(),
    tipo: z.enum(["ingreso", "egreso"]),
    medioPago: z.enum(["efectivo", "transferencia", "cheque"]),
    concepto: z.string().trim().max(300).optional(),
    // Siempre positivo: el signo lo determina el tipo.
    importe: importePositivo,
    clienteId: z.uuid().nullable().optional(),
    proveedorId: z.uuid().nullable().optional(),
    chequeId: z.uuid().nullable().optional(),
    conciliado: z.boolean().default(false),
  })
  .refine((m) => !(m.clienteId && m.proveedorId), {
    message: "Un movimiento no puede ser de un cliente y un proveedor a la vez",
    path: ["proveedorId"],
  })
  .refine((m) => m.medioPago !== "cheque" || Boolean(m.chequeId), {
    message: "Si el medio de pago es cheque, hay que vincular el cheque",
    path: ["chequeId"],
  });

export const movimientoActualizarSchema = z.object({
  id: z.uuid(),
  datos: movimientoInputSchema,
});

/** Columnas por las que se puede ordenar el listado de movimientos. */
export const CAMPOS_ORDEN_MOVIMIENTOS = ["fecha", "importe", "cuenta", "tipo"] as const;

export const movimientosListarSchema = z.object({
  cuentaId: z.uuid().optional(),
  tipo: z.enum(tiposMovimiento).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  ...ordenSchema(CAMPOS_ORDEN_MOVIMIENTOS, "fecha", "desc"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(200).default(50),
});

// --- Cheques ---

export const chequeInputSchema = z
  .object({
    numero: z.string().trim().min(1, "El número es obligatorio").max(50),
    libradorClienteId: z.uuid().nullable().optional(),
    libradorNombre: z.string().trim().max(200).optional(),
    banco: z.string().trim().max(100).optional(),
    fechaEmision: fecha.optional(),
    fechaPago: fecha,
    importe: importePositivo,
    estado: z
      .enum(["en_cartera", "depositado", "acreditado", "rechazado", "endosado"])
      .default("en_cartera"),
  })
  .refine((c) => Boolean(c.libradorClienteId) || Boolean(c.libradorNombre), {
    message: "Indicá el librador: un cliente o un nombre libre",
    path: ["libradorNombre"],
  });

export const chequeActualizarSchema = z.object({
  id: z.uuid(),
  datos: chequeInputSchema,
});

/** El rango de fechas de cheques aplica sobre la fecha de pago: es la que
 *  dice cuándo entra la plata, que es para lo que se mira la cartera. */
export const CAMPOS_ORDEN_CHEQUES = ["fechaPago", "importe", "librador", "estado"] as const;

export const chequesListarSchema = z.object({
  estado: z.enum(["en_cartera", "depositado", "acreditado", "rechazado", "endosado"]).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  ...ordenSchema(CAMPOS_ORDEN_CHEQUES, "fechaPago"),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(200).default(50),
});

export type CuentaInput = z.infer<typeof cuentaInputSchema>;
export type CuentaActualizar = z.infer<typeof cuentaActualizarSchema>;
export type MovimientoInput = z.infer<typeof movimientoInputSchema>;
export type MovimientoActualizar = z.infer<typeof movimientoActualizarSchema>;
export type MovimientosListar = z.infer<typeof movimientosListarSchema>;
export type ChequeInput = z.infer<typeof chequeInputSchema>;
export type ChequeActualizar = z.infer<typeof chequeActualizarSchema>;
export type ChequesListar = z.infer<typeof chequesListarSchema>;
