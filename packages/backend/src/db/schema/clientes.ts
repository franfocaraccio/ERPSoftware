import { sql } from "drizzle-orm";
import { index, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase, condicionIvaEnum } from "./_comunes.js";

export const estadoClienteEnum = pgEnum("estado_cliente", ["activo", "inactivo", "en_mora"]);

// Saldo de cuenta corriente y DSO son derivados: se calculan al leer
// (facturas − cobranzas), nunca se persisten.
export const clientes = pgTable(
  "clientes",
  {
    ...columnasBase,
    razonSocial: text("razon_social").notNull(),
    cuit: text("cuit"), // nullable: consumidor final puede no tener CUIT cargado
    condicionIva: condicionIvaEnum("condicion_iva").notNull(),
    email: text("email"),
    telefono: text("telefono"),
    direccion: text("direccion"),
    limiteCredito: numeric("limite_credito", { precision: 14, scale: 2 }),
    estado: estadoClienteEnum("estado").default("activo").notNull(),
  },
  (t) => [
    index("clientes_tenant_idx").on(t.tenantId),
    uniqueIndex("clientes_tenant_cuit_unq")
      .on(t.tenantId, t.cuit)
      .where(sql`${t.cuit} is not null`),
  ],
);
