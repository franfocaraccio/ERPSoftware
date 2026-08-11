import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const rolMensajeAsistenteEnum = pgEnum("rol_mensaje_asistente", ["user", "assistant"]);

/**
 * Conversaciones con el asistente de ayuda.
 *
 * Existen para poder leer qué le pregunta la gente: eso es lo que dice qué
 * partes del manual están flojas y qué herramientas necesita la Fase B. Sin
 * esto, esa lista se elige adivinando.
 *
 * El `id` lo genera el cliente cuando abre el panel, porque es lo único que
 * permite agrupar los turnos de una misma charla —el historial viaja entero en
 * cada request y el servidor no puede distinguir una conversación nueva de la
 * continuación de otra—. Que venga del cliente es aceptable porque **lo
 * guardado nunca se le devuelve al modelo**: el contexto sale del historial que
 * manda el navegador, no de esta tabla. Un id repetido a propósito ensucia una
 * estadística, no envenena un prompt.
 */
export const asistenteConversaciones = pgTable(
  "asistente_conversaciones",
  {
    id: uuid("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    // Sin FK contra `user`: quien entra por un link de solo lectura no es un
    // usuario, y se guarda como "acceso:<id>".
    usuarioId: text("usuario_id"),
    creada: timestamp("creada", { withTimezone: true }).defaultNow().notNull(),
    ultimoMensaje: timestamp("ultimo_mensaje", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("asistente_conversaciones_tenant_idx").on(t.tenantId, t.ultimoMensaje)],
);

/**
 * Un mensaje de una conversación. Insert-only, como el audit log: se escribe y
 * no se toca más.
 */
export const asistenteMensajes = pgTable(
  "asistente_mensajes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    conversacionId: uuid("conversacion_id").notNull(),
    rol: rolMensajeAsistenteEnum("rol").notNull(),
    contenido: text("contenido").notNull(),
    creado: timestamp("creado", { withTimezone: true }).defaultNow().notNull(),
    // Solo en las respuestas del asistente: sirve para ver qué cuesta y si el
    // cache está pegando de verdad.
    modelo: text("modelo"),
    tokensEntrada: integer("tokens_entrada"),
    tokensSalida: integer("tokens_salida"),
    tokensCache: integer("tokens_cache"),
  },
  (t) => [index("asistente_mensajes_conversacion_idx").on(t.tenantId, t.conversacionId, t.creado)],
);
