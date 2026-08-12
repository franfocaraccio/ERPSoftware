import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const accionAuditoriaEnum = pgEnum("accion_auditoria", [
  "alta",
  "modificacion",
  "baja",
  "transicion_estado",
  // No modifica nada, pero llevarse un padrón entero es lo que uno quiere
  // poder reconstruir después.
  "exportacion",
]);

// Regla dura: audit log de toda operación que impacte saldos, stock o impuestos.
// Insert-only: el rol de la aplicación no tiene UPDATE ni DELETE sobre esta tabla.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    usuarioId: text("usuario_id"), // id de usuario BetterAuth; null si fue un job
    fecha: timestamp("fecha", { withTimezone: true }).defaultNow().notNull(),
    tabla: text("tabla").notNull(),
    registroId: uuid("registro_id"),
    accion: accionAuditoriaEnum("accion").notNull(),
    // Snapshot del cambio: { antes, despues } o el payload del evento.
    detalle: jsonb("detalle"),
  },
  (t) => [
    index("audit_log_tenant_fecha_idx").on(t.tenantId, t.fecha),
    index("audit_log_tenant_tabla_registro_idx").on(t.tenantId, t.tabla, t.registroId),
  ],
);
