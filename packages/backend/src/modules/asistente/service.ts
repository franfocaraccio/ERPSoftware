import { eq, sql } from "drizzle-orm";
import { asistenteConversaciones, asistenteMensajes } from "../../db/schema/asistente.js";
import { withTenant } from "../../db/tenant-db.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

export interface ConsumoTokens {
  modelo: string;
  entrada: number | undefined;
  salida: number | undefined;
  cache: number | undefined;
}

/**
 * Guarda la pregunta del usuario, creando la conversación si es el primer turno.
 *
 * Solo persiste el mensaje nuevo. El navegador manda el historial entero en
 * cada request —así funciona `useChat`—, pero los turnos anteriores ya están
 * guardados: volver a escribirlos duplicaría todo en cada vuelta.
 */
export async function guardarPregunta(
  actor: Actor,
  conversacionId: string,
  contenido: string,
): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx
      .insert(asistenteConversaciones)
      .values({
        id: conversacionId,
        tenantId: actor.tenantId,
        usuarioId: actor.usuarioId,
      })
      // El cliente manda el mismo id en cada turno: el primero crea la
      // conversación y los demás solo corren su marca de tiempo.
      .onConflictDoUpdate({
        target: asistenteConversaciones.id,
        set: { ultimoMensaje: sql`now()` },
      });

    await tx.insert(asistenteMensajes).values({
      tenantId: actor.tenantId,
      conversacionId,
      rol: "user",
      contenido,
    });
  });
}

/** Guarda la respuesta del asistente junto con lo que costó producirla. */
export async function guardarRespuesta(
  actor: Actor,
  conversacionId: string,
  contenido: string,
  consumo: ConsumoTokens,
): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx.insert(asistenteMensajes).values({
      tenantId: actor.tenantId,
      conversacionId,
      rol: "assistant",
      contenido,
      modelo: consumo.modelo,
      tokensEntrada: consumo.entrada ?? null,
      tokensSalida: consumo.salida ?? null,
      tokensCache: consumo.cache ?? null,
    });
  });
}

export interface ConversacionGuardada {
  id: string;
  usuarioId: string | null;
  creada: Date;
  ultimoMensaje: Date;
}

/** Conversaciones de la empresa, de la más reciente a la más vieja. */
export async function listarConversaciones(
  actor: Actor,
  limite = 50,
): Promise<ConversacionGuardada[]> {
  return withTenant(actor.tenantId, async (tx) => {
    return tx
      .select({
        id: asistenteConversaciones.id,
        usuarioId: asistenteConversaciones.usuarioId,
        creada: asistenteConversaciones.creada,
        ultimoMensaje: asistenteConversaciones.ultimoMensaje,
      })
      .from(asistenteConversaciones)
      .orderBy(sql`${asistenteConversaciones.ultimoMensaje} desc`)
      .limit(limite);
  });
}

/** Mensajes de una conversación, en orden cronológico. */
export async function listarMensajes(actor: Actor, conversacionId: string) {
  return withTenant(actor.tenantId, async (tx) => {
    return tx
      .select()
      .from(asistenteMensajes)
      .where(eq(asistenteMensajes.conversacionId, conversacionId))
      .orderBy(asistenteMensajes.creado);
  });
}
