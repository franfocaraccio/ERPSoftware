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
    // Trazabilidad cobro-factura / pago-factura y cuenta corriente por contraparte.
    clienteId: uuid("cliente_id").references(() => clientes.id),
    proveedorId: uuid("proveedor_id").references(() => proveedores.id),
    comprobanteVentaId: uuid("comprobante_venta_id").references(() => comprobantesVenta.id),
    comprobanteCompraId: uuid("comprobante_compra_id").references(() => comprobantesCompra.id),
    chequeId: uuid("cheque_id").references(() => cheques.id),
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
