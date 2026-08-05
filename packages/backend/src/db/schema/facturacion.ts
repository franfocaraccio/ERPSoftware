import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { alicuotaIvaEnum, columnasBase, condicionIvaEnum, monedaEnum } from "./_comunes.js";
import { clientes } from "./clientes.js";
import { productos } from "./stock.js";

export const claseComprobanteEnum = pgEnum("clase_comprobante", [
  "factura",
  "nota_credito",
  "nota_debito",
]);

export const letraComprobanteEnum = pgEnum("letra_comprobante", ["A", "B", "C", "E"]);

// Fuente de verdad de la máquina de estados (ver CLAUDE.md).
// 'borrador' es el único estado editable por el usuario.
export const estadoComprobanteEnum = pgEnum("estado_comprobante", [
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
]);

// Fase 1: carga manual (el usuario tipea punto de venta y número, sin ARCA).
// Fase 3: numero/cae/cae_vencimiento los escribe el proceso de emisión.
// Un comprobante con CAE es INMUTABLE — correcciones solo por nota de crédito/débito.
export const comprobantesVenta = pgTable(
  "comprobantes_venta",
  {
    ...columnasBase,
    clase: claseComprobanteEnum("clase").default("factura").notNull(),
    letra: letraComprobanteEnum("letra").notNull(),
    puntoVenta: integer("punto_venta").notNull(),
    numero: integer("numero"), // null mientras es borrador sin numerar
    clienteId: uuid("cliente_id")
      .references(() => clientes.id)
      .notNull(),
    fechaEmision: date("fecha_emision").notNull(),
    // Snapshot de la condición IVA del receptor al momento de emitir
    // (obligatoria en el request a ARCA desde abril 2026).
    condicionIvaReceptor: condicionIvaEnum("condicion_iva_receptor").notNull(),
    condicionVentaDias: integer("condicion_venta_dias").default(0).notNull(),
    estado: estadoComprobanteEnum("estado").default("borrador").notNull(),
    moneda: monedaEnum("moneda").default("ARS").notNull(),
    // Totales recalculados desde los ítems por @erp/core/invoicing en cada guardado
    // de borrador; congelados al emitir.
    neto: numeric("neto", { precision: 14, scale: 2 }).default("0").notNull(),
    iva: numeric("iva", { precision: 14, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).default("0").notNull(),
    cae: text("cae"),
    caeVencimiento: date("cae_vencimiento"),
    pdfPath: text("pdf_path"), // ruta en Supabase Storage
  },
  (t) => [
    index("comprobantes_venta_tenant_idx").on(t.tenantId),
    index("comprobantes_venta_tenant_cliente_idx").on(t.tenantId, t.clienteId),
    index("comprobantes_venta_tenant_estado_idx").on(t.tenantId, t.estado),
    uniqueIndex("comprobantes_venta_numeracion_unq")
      .on(t.tenantId, t.clase, t.letra, t.puntoVenta, t.numero)
      .where(sql`${t.numero} is not null`),
  ],
);

export const itemsComprobanteVenta = pgTable(
  "items_comprobante_venta",
  {
    ...columnasBase,
    comprobanteId: uuid("comprobante_id")
      .references(() => comprobantesVenta.id, { onDelete: "cascade" })
      .notNull(),
    productoId: uuid("producto_id").references(() => productos.id), // null = línea libre
    descripcion: text("descripcion").notNull(), // snapshot, aunque haya producto vinculado
    cantidad: numeric("cantidad", { precision: 14, scale: 3 }).notNull(),
    precioUnitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
    alicuotaIva: alicuotaIvaEnum("alicuota_iva").notNull(),
    orden: integer("orden").default(0).notNull(),
  },
  (t) => [
    index("items_comprobante_venta_tenant_idx").on(t.tenantId),
    index("items_comprobante_venta_comprobante_idx").on(t.tenantId, t.comprobanteId),
    check("items_comprobante_venta_cantidad_check", sql`${t.cantidad} <> 0`),
  ],
);
