import { z } from "zod";

/**
 * Cuerpo del POST /api/chat.
 *
 * El cliente manda el historial completo en cada turno (así funciona `useChat`),
 * y ese historial es input externo como cualquier otro: entra por Zod antes de
 * tocar nada. Los topes no son decorativos —cada mensaje que entra se paga como
 * tokens, así que un historial sin límite es una factura sin límite.
 */

const MAX_MENSAJES = 40;
const MAX_CARACTERES_POR_MENSAJE = 4000;
export const MAX_CARACTERES_TOTAL = 24000;

const parteSchema = z.object({
  type: z.string(),
  text: z.string().max(MAX_CARACTERES_POR_MENSAJE).optional(),
});

const mensajeSchema = z.object({
  // `system` no se acepta: las instrucciones las pone el servidor. Si el
  // cliente pudiera mandar un mensaje de sistema, podría reescribir las reglas
  // del asistente desde el navegador.
  role: z.enum(["user", "assistant"]),
  parts: z.array(parteSchema).max(20),
});

export const chatSchema = z
  .object({
    messages: z.array(mensajeSchema).min(1).max(MAX_MENSAJES),
    /**
     * Id de la charla, generado por el navegador al abrir el panel. Es lo único
     * que permite agrupar los turnos, porque el historial llega entero en cada
     * request y el servidor no distingue una conversación nueva de la
     * continuación de otra. Opcional: si no viene, la conversación no se guarda
     * y el chat funciona igual.
     */
    conversacionId: z.uuid().optional(),
  })
  .refine(
    (body) => textoTotal(body.messages) <= MAX_CARACTERES_TOTAL,
    `La conversación superó los ${MAX_CARACTERES_TOTAL} caracteres. Empezá una nueva.`,
  );

export type MensajeChat = z.infer<typeof mensajeSchema>;

function textoTotal(mensajes: MensajeChat[]): number {
  let total = 0;
  for (const mensaje of mensajes) {
    for (const parte of mensaje.parts) {
      total += parte.text?.length ?? 0;
    }
  }
  return total;
}

/**
 * Aplana las partes de un UIMessage al texto plano que espera el modelo.
 *
 * En Fase A solo existen partes de texto. Cuando haya herramientas van a
 * aparecer partes de tool call, y este mapeo hay que rehacerlo con
 * `convertToModelMessages` en lugar de aplanar a mano.
 */
export function aMensajesDelModelo(mensajes: MensajeChat[]) {
  return mensajes
    .map((mensaje) => ({
      role: mensaje.role,
      content: mensaje.parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n")
        .trim(),
    }))
    .filter((m) => m.content.length > 0);
}
