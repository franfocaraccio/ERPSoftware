import { sql } from "drizzle-orm";
import {
  boolean,
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
import { columnasBase } from "./_comunes.js";

export const tipoCategoriaEnum = pgEnum("tipo_categoria", ["gasto", "ingreso"]);

/**
 * El plan de cuentas simple de cada empresa: en qué se va la plata y de dónde
 * entra, fuera de las ventas. Es lo que convierte "Sueldos" de un texto libre
 * en tesorería en una línea del estado de resultados.
 *
 * Cada empresa arranca con una lista inicial y la edita a su gusto (decisión
 * de Fran del 12/10/2026). Una categoría no se borra: se desactiva, para no
 * dejar huérfanos los movimientos que ya la usan.
 */
export const categorias = pgTable(
  "categorias",
  {
    ...columnasBase,
    nombre: text("nombre").notNull(),
    tipo: tipoCategoriaEnum("tipo").notNull(),
    activa: boolean("activa").default(true).notNull(),
    orden: integer("orden").default(0).notNull(),
  },
  (t) => [uniqueIndex("categorias_tenant_nombre_tipo_unq").on(t.tenantId, t.tipo, t.nombre)],
);

/**
 * Gastos que se repiten todos los meses sin comprobante: sueldos, alquiler.
 * **Sólo se proyectan** (decisión de Fran): entran en la proyección de caja,
 * pero el pago real se sigue registrando a mano en Tesorería.
 */
export const gastosRecurrentes = pgTable(
  "gastos_recurrentes",
  {
    ...columnasBase,
    descripcion: text("descripcion").notNull(),
    // Sin `.references` en TS para no crear una importación circular con
    // tesorería; la FK existe en la base (migración 0016).
    categoriaId: uuid("categoria_id"),
    cuentaId: uuid("cuenta_id").notNull(),
    importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
    diaDelMes: integer("dia_del_mes").notNull(),
    desde: date("desde").notNull(),
    hasta: date("hasta"),
    activo: boolean("activo").default(true).notNull(),
  },
  (t) => [
    index("gastos_recurrentes_tenant_idx").on(t.tenantId),
    check("gastos_recurrentes_importe_check", sql`${t.importe} > 0`),
    check("gastos_recurrentes_dia_check", sql`${t.diaDelMes} between 1 and 31`),
  ],
);
