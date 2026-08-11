import { anthropic } from "@ai-sdk/anthropic";
import { pipeUIMessageStreamToResponse, streamText, toUIMessageStream } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import { resolverSesion } from "../../trpc/context.js";
import { consumirCupo } from "./limite.js";
import { cargarManual } from "./manual.js";
import { bloqueDelUsuario, bloqueInvariante } from "./prompt.js";
import { aMensajesDelModelo, chatSchema } from "./schema.js";

/**
 * Haiku alcanza de sobra para responder sobre un manual que ya está en el
 * prompt: no hay razonamiento que hacer, hay que leer y resumir. Cuando en la
 * Fase B haya herramientas y preguntas de varios saltos, conviene medir si hace
 * falta subir a Sonnet.
 */
const MODELO = process.env.ASISTENTE_MODELO ?? "claude-haiku-4-5";

let instrucciones: string | null = null;

export function asistenteHabilitado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Carga el manual al arrancar. Si falta la API key el asistente queda apagado
 * entero y la ruta contesta 503: es preferible a un chat que aparece en la UI
 * y falla al primer mensaje.
 */
export function inicializarAsistente(): void {
  if (!asistenteHabilitado()) {
    console.warn("[asistente] Sin ANTHROPIC_API_KEY: el chat queda deshabilitado.");
    return;
  }
  instrucciones = bloqueInvariante(cargarManual());
  console.log(`[asistente] Manual cargado (${instrucciones.length} caracteres), modelo ${MODELO}.`);
}

export const asistenteRouter: express.Router = express.Router();

asistenteRouter.get("/api/chat/estado", (_req, res) => {
  res.json({ habilitado: asistenteHabilitado() });
});

asistenteRouter.post("/api/chat", express.json({ limit: "128kb" }), manejarChat);

async function manejarChat(req: Request, res: Response): Promise<void> {
  if (!instrucciones) {
    res.status(503).json({ error: "El asistente no está disponible." });
    return;
  }

  // Misma resolución de sesión que tRPC: el tenant sale del servidor, nunca
  // del cliente.
  const sesion = await resolverSesion(fromNodeHeaders(req.headers));
  if (!sesion?.activeOrganizationId) {
    res.status(401).json({ error: "Sesión no válida." });
    return;
  }

  const parseo = chatSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: parseo.error.issues[0]?.message ?? "Mensaje inválido." });
    return;
  }

  const cupo = consumirCupo(sesion.activeOrganizationId);
  if (!cupo.permitido) {
    res.status(429).json({
      error: `Llegaste al límite de ${cupo.limite} consultas por día. Se renueva mañana.`,
    });
    return;
  }

  const mensajes = aMensajesDelModelo(parseo.data.messages);
  if (mensajes.length === 0) {
    res.status(400).json({ error: "El mensaje está vacío." });
    return;
  }

  const resultado = streamText({
    model: anthropic(MODELO),
    instructions: [
      {
        role: "system",
        content: instrucciones,
        // El manual es el 99% del prompt y no cambia nunca: cacheado cuesta
        // una décima parte a partir del segundo mensaje.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      {
        role: "system",
        content: bloqueDelUsuario({
          nombre: sesion.nombre,
          rol: sesion.rolOrganizacion,
          esAccesoPorLink: sesion.esAccesoPorLink,
        }),
      },
    ],
    messages: mensajes,
    onFinish({ usage }) {
      // Sin esto no hay forma de saber qué cuesta el asistente ni si el cache
      // está funcionando de verdad.
      console.log(
        `[asistente] tenant=${sesion.activeOrganizationId} ` +
          `entrada=${usage.inputTokens ?? "?"} salida=${usage.outputTokens ?? "?"} ` +
          `cache_lectura=${usage.inputTokenDetails.cacheReadTokens ?? 0} ` +
          `cache_escritura=${usage.inputTokenDetails.cacheWriteTokens ?? 0} ` +
          `restantes_hoy=${cupo.restantes}`,
      );
    },
    onError({ error }) {
      console.error("[asistente] Error generando la respuesta:", error);
    },
  });

  await pipeUIMessageStreamToResponse({
    response: res,
    stream: toUIMessageStream({ stream: resultado.stream }),
  });
}
