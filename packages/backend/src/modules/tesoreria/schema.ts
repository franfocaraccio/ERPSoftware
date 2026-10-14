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
    /** En qué se gastó o de dónde entró. Sólo sin contraparte. */
    categoriaId: z.uuid().nullable().optional(),
    conciliado: z.boolean().default(false),
    /**
     * Qué comprobantes cancela y por cuánto. Lo que no se imputa queda a
     * cuenta de la contraparte. Las reglas (misma contraparte, no de más)
     * las valida el service.
     */
    imputaciones: z
      .array(z.object({ comprobanteId: z.uuid(), importe: importePositivo }))
      .max(200)
      .default([]),
  })
  .refine((m) => !(m.clienteId && m.proveedorId), {
    message: "Un movimiento no puede ser de un cliente y un proveedor a la vez",
    path: ["proveedorId"],
  })
  .refine((m) => !(m.categoriaId && (m.clienteId || m.proveedorId)), {
    // Un cobro o un pago a una contraparte cancela un comprobante, que ya
    // cuenta en resultados: categorizarlo lo contaría dos veces.
    message: "Un cobro o pago a un cliente o proveedor no lleva categoría",
    path: ["categoriaId"],
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
/**
 * Lo que recibe el service. Las imputaciones son opcionales, como en la API:
 * sin ellas, todo el movimiento queda a cuenta.
 */
export type MovimientoInput = Omit<z.infer<typeof movimientoInputSchema>, "imputaciones"> & {
  imputaciones?: z.infer<typeof movimientoInputSchema>["imputaciones"];
};
export type MovimientoActualizar = { id: string; datos: MovimientoInput };
export type MovimientosListar = z.infer<typeof movimientosListarSchema>;
export type ChequeInput = z.infer<typeof chequeInputSchema>;
export type ChequeActualizar = z.infer<typeof chequeActualizarSchema>;
export type ChequesListar = z.infer<typeof chequesListarSchema>;

// --- Conciliación bancaria ---

/** Un importe con signo, como viene del extracto: "-3600.00". */
const importeConSigno = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Importe inválido (usar punto decimal, máximo 2 decimales)");

/**
 * Una línea del extracto, de vuelta desde la pantalla.
 *
 * Vuelve tal como se propuso; el servidor recalcula su huella y no confía en
 * nada más de lo que trae.
 */
const lineaExtractoSchema = z.object({
  fecha,
  descripcion: z.string().max(500),
  importe: importeConSigno,
  saldo: importeConSigno,
});

const decisionSchema = z.discriminatedUnion("accion", [
  z.object({
    linea: lineaExtractoSchema,
    accion: z.literal("conciliar"),
    movimientoId: z.uuid(),
  }),
  z
    .object({
      linea: lineaExtractoSchema,
      accion: z.literal("crear"),
      // Sin "cheque": un cheque se carga vinculado a su cheque, desde Tesorería.
      medioPago: z.enum(["efectivo", "transferencia"]).default("transferencia"),
      concepto: z.string().trim().max(300).optional(),
      clienteId: z.uuid().nullable().optional(),
      proveedorId: z.uuid().nullable().optional(),
      categoriaId: z.uuid().nullable().optional(),
    })
    .refine((d) => !(d.clienteId && d.proveedorId), {
      message: "Un movimiento no puede ser de un cliente y un proveedor a la vez",
      path: ["proveedorId"],
    }),
  z.object({
    linea: lineaExtractoSchema,
    accion: z.literal("ignorar"),
  }),
]);

export const confirmarConciliacionSchema = z.object({
  cuentaId: z.uuid(),
  archivoHash: z.string().regex(/^[0-9a-f]{64}$/, "Hash inválido"),
  // Un extracto de seis meses de una cuenta corriente activa tiene cientos de
  // líneas; el tope es para que un pedido no sea una forma de colgar la base.
  decisiones: z.array(decisionSchema).min(1).max(2000),
});

export type ConfirmarConciliacion = z.infer<typeof confirmarConciliacionSchema>;
