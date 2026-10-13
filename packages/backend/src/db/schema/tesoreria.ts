import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { columnasBase, monedaEnum } from "./_comunes.js";
import { clientes } from "./clientes.js";
import { comprobantesCompra } from "./compras.js";
import { comprobantesVenta } from "./facturacion.js";
import { proveedores } from "./proveedores.js";

export const tipoCuentaEnum = pgEnum("tipo_cuenta", [
  "efectivo",
  "cuenta_corriente",
  "caja_ahorro",
]);

export const tipoMovimientoEnum = pgEnum("tipo_movimiento", ["ingreso", "egreso"]);

export const medioPagoEnum = pgEnum("medio_pago", ["efectivo", "transferencia", "cheque"]);

export const estadoChequeEnum = pgEnum("estado_cheque", [
  "en_cartera",
  "depositado",
  "acreditado",
  "rechazado",
  "endosado", // solo descriptivo: no registra destinatario ni genera egreso
]);

// Saldo actual es derivado: Σ movimientos con signo, filtrado por cuenta.
export const cuentas = pgTable(
  "cuentas",
  {
    ...columnasBase,
    nombre: text("nombre").notNull(), // ej: Caja, Banco Nación CC
    tipo: tipoCuentaEnum("tipo").notNull(),
    moneda: monedaEnum("moneda").default("ARS").notNull(),
  },
  (t) => [
    index("cuentas_tenant_idx").on(t.tenantId),
    uniqueIndex("cuentas_tenant_nombre_unq").on(t.tenantId, t.nombre),
  ],
);

// Cheques siempre en ARS (decisión de modelado).
// Días para cobro es derivado: fecha_pago − hoy, calculado al leer.
export const cheques = pgTable(
  "cheques",
  {
    ...columnasBase,
    numero: text("numero").notNull(),
    // Librador: FK a cliente, o texto libre si es cheque de un tercero.
    libradorClienteId: uuid("librador_cliente_id").references(() => clientes.id),
    libradorNombre: text("librador_nombre"),
    banco: text("banco"),
    fechaEmision: date("fecha_emision"),
    fechaPago: date("fecha_pago").notNull(), // fecha en que el cheque es cobrable
    importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
    estado: estadoChequeEnum("estado").default("en_cartera").notNull(),
  },
  (t) => [
    index("cheques_tenant_idx").on(t.tenantId),
    index("cheques_tenant_estado_fecha_idx").on(t.tenantId, t.estado, t.fechaPago),
    check("cheques_importe_check", sql`${t.importe} > 0`),
    check(
      "cheques_librador_check",
      sql`${t.libradorClienteId} is not null or ${t.libradorNombre} is not null`,
    ),
  ],
);

// El importe se guarda siempre positivo; el signo lo da el tipo (ingreso/egreso).
// La moneda del movimiento es la de su cuenta (no se repite acá).
export const movimientos = pgTable(
  "movimientos",
  {
    ...columnasBase,
    fecha: date("fecha").notNull(),
    cuentaId: uuid("cuenta_id")
      .references(() => cuentas.id)
      .notNull(),
    tipo: tipoMovimientoEnum("tipo").notNull(),
    medioPago: medioPagoEnum("medio_pago").notNull(),
    concepto: text("concepto"),
    importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
    // Cuenta corriente por contraparte. Qué comprobantes cancela un cobro o un
    // pago va en `imputaciones`, que admite varios y parciales.
    clienteId: uuid("cliente_id").references(() => clientes.id),
    proveedorId: uuid("proveedor_id").references(() => proveedores.id),
    // En desuso: un movimiento sólo podía apuntar a un comprobante. Lo
    // reemplazó la tabla `imputaciones`. Nunca se escribieron.
    comprobanteVentaId: uuid("comprobante_venta_id").references(() => comprobantesVenta.id),
    comprobanteCompraId: uuid("comprobante_compra_id").references(() => comprobantesCompra.id),
    chequeId: uuid("cheque_id").references(() => cheques.id),
    // En qué se gastó o de dónde entró, para el estado de resultados. Sólo en
    // movimientos sin contraparte: un pago a un proveedor cancela una compra,
    // que ya cuenta como gasto (o como mercadería) por su cuenta.
    categoriaId: uuid("categoria_id"),
    conciliado: boolean("conciliado").default(false).notNull(),
  },
  (t) => [
    index("movimientos_tenant_idx").on(t.tenantId),
    index("movimientos_tenant_cuenta_fecha_idx").on(t.tenantId, t.cuentaId, t.fecha),
    index("movimientos_tenant_cliente_idx").on(t.tenantId, t.clienteId),
    index("movimientos_tenant_proveedor_idx").on(t.tenantId, t.proveedorId),
    check("movimientos_importe_check", sql`${t.importe} > 0`),
  ],
);

/**
 * Qué parte de un cobro o un pago cancela cada comprobante.
 *
 * Un cobro puede cancelar varias facturas, y una factura puede cobrarse en
 * varias veces: por eso es una tabla aparte y no una columna del movimiento.
 * Lo que un movimiento no imputa queda **a cuenta** de la contraparte, y se
 * aplica a sus comprobantes por FIFO al calcular saldos (`@erp/core/balances`).
 *
 * Exactamente uno de los dos comprobantes: un cobro imputa ventas, un pago
 * imputa compras. Que sean de la misma contraparte que el movimiento y que no
 * se impute de más lo valida el service.
 */
export const imputaciones = pgTable(
  "imputaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    movimientoId: uuid("movimiento_id")
      .references(() => movimientos.id, { onDelete: "cascade" })
      .notNull(),
    comprobanteVentaId: uuid("comprobante_venta_id").references(() => comprobantesVenta.id),
    comprobanteCompraId: uuid("comprobante_compra_id").references(() => comprobantesCompra.id),
    importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
    creado: timestamp("creado", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("imputaciones_tenant_movimiento_idx").on(t.tenantId, t.movimientoId),
    index("imputaciones_tenant_venta_idx").on(t.tenantId, t.comprobanteVentaId),
    index("imputaciones_tenant_compra_idx").on(t.tenantId, t.comprobanteCompraId),
    check("imputaciones_importe_check", sql`${t.importe} > 0`),
    check(
      "imputaciones_un_comprobante",
      sql`(${t.comprobanteVentaId} is null) <> (${t.comprobanteCompraId} is null)`,
    ),
  ],
);
