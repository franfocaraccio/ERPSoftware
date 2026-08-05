import { pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";

// tenant_id es el id de la organización de BetterAuth (string, no uuid).
// La FK real hacia la tabla de organizaciones se agrega cuando se configure BetterAuth.
export const columnasBase = {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const condicionIvaEnum = pgEnum("condicion_iva", [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
]);

export const monedaEnum = pgEnum("moneda", ["ARS", "USD"]);

// Alícuotas de IVA vigentes. El mapeo a códigos de ARCA vive en @erp/arca (codigos.ts).
export const alicuotaIvaEnum = pgEnum("alicuota_iva", [
  "0",
  "2.5",
  "5",
  "10.5",
  "21",
  "27",
  "exento",
  "no_gravado",
]);
