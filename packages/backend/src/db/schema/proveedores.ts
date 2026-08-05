import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase, condicionIvaEnum } from "./_comunes.js";

// Saldo a pagar y fecha de próximo vencimiento son derivados de comprobantes_compra
// y sus pagos: se calculan al leer.
export const proveedores = pgTable(
  "proveedores",
  {
    ...columnasBase,
    razonSocial: text("razon_social").notNull(),
    cuit: text("cuit"),
    condicionIva: condicionIvaEnum("condicion_iva").notNull(),
    rubro: text("rubro"),
    condicionPagoDias: integer("condicion_pago_dias").default(0).notNull(),
    cbu: text("cbu"),
    aliasCbu: text("alias_cbu"),
    email: text("email"),
    telefono: text("telefono"),
  },
  (t) => [
    index("proveedores_tenant_idx").on(t.tenantId),
    uniqueIndex("proveedores_tenant_cuit_unq")
      .on(t.tenantId, t.cuit)
      .where(sql`${t.cuit} is not null`),
  ],
);
