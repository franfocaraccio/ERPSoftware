import { openai } from "@ai-sdk/openai";
import { pipeUIMessageStreamToResponse, streamText, toUIMessageStream } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import { resolverSesion } from "../../trpc/context.js";
import { consumirCupo } from "./limite.js";
import { cargarManual } from "./manual.js";
import { bloqueDelUsuario, bloqueInvariante } from "./prompt.js";
import { aMensajesDelModelo, chatSchema } from "./schema.js";
import { guardarPregunta, guardarRespuesta } from "./service.js";

/**
 * Corre algo cuyo resultado no le importa a quien preguntó.
 *
 * Guardar la conversación es para nosotros, no para el usuario: si la base
 * falla, la respuesta ya está escrita o escribiéndose y sería absurdo cortarla
 * por eso. Queda en el log y sigue.
 */
async function registrar(tarea: () => Promise<void>): Promise<void> {
  try {
    await tarea();
  } catch (error) {
    console.error("[asistente] No se pudo guardar la conversación:", error);
  }
}

/**
 * Un modelo mini alcanza de sobra para responder sobre un manual que ya está en
 * el prompt: no hay razonamiento que hacer, hay que leer y resumir. Cuando en la
 * Fase B haya herramientas y preguntas de varios saltos, conviene medir si hace
 * falta subir de gama.
 */
const MODELO = process.env.ASISTENTE_MODELO ?? "gpt-5.4-mini";

/**
 * Etiqueta de ruteo del cache de OpenAI.
 *
 * A diferencia de Anthropic, acá el cache es automático: no se marca el bloque,
 * OpenAI reutiliza solo el prefijo repetido de prompts largos. Esta clave le
 * dice que todos estos pedidos comparten prefijo, para que caigan en la misma
 * máquina y el prefijo se encuentre cacheado. Es una pista de ruteo, no una
 * orden: sin ella igual cachea, pero pega menos.
 *
 * Lleva la longitud del manual adentro para que al editar `docs/ayuda` cambie
 * la clave: el prefijo viejo ya no existe y seguir apuntando ahí sería mandar
 * a todos a buscar un cache que no va a estar.
 */
let claveDeCache = "erp-ayuda";

let instrucciones: string | null = null;

export function asistenteHabilitado(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Carga el manual al arrancar. Si falta la API key el asistente queda apagado
 * entero y la ruta contesta 503: es preferible a un chat que aparece en la UI
 * y falla al primer mensaje.
 */
export function inicializarAsistente(): void {
  if (!asistenteHabilitado()) {
    console.warn("[asistente] Sin OPENAI_API_KEY: el chat queda deshabilitado.");
    return;
  }
  instrucciones = bloqueInvariante(cargarManual());
  claveDeCache = `erp-ayuda-${instrucciones.length}`;
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

  const actor = { tenantId: sesion.activeOrganizationId, usuarioId: sesion.usuarioId };
  const conversacionId = parseo.data.conversacionId;

  // La última del usuario es la pregunta nueva; las anteriores ya se guardaron
  // en sus propios turnos.
  const ultimaPregunta = mensajes.filter((m) => m.role === "user").at(-1)?.content;
  if (conversacionId && ultimaPregunta) {
    await registrar(() => guardarPregunta(actor, conversacionId, ultimaPregunta));
  }

  const resultado = streamText({
    model: openai(MODELO),
    // El bloque grande va primero y es idéntico para todos: OpenAI cachea el
    // prefijo repetido por su cuenta, así que el orden no es cosmético.
    instructions: [
      { role: "system", content: instrucciones },
      {
        role: "system",
        content: bloqueDelUsuario({
          nombre: sesion.nombre,
          rol: sesion.rolOrganizacion,
          esAccesoPorLink: sesion.esAccesoPorLink,
        }),
      },
    ],
    providerOptions: { openai: { promptCacheKey: claveDeCache } },
    messages: mensajes,
    async onFinish({ usage, text }) {
      // Sin esto no hay forma de saber qué cuesta el asistente ni si el cache
      // está funcionando de verdad.
      console.log(
        `[asistente] tenant=${sesion.activeOrganizationId} ` +
          `entrada=${usage.inputTokens ?? "?"} salida=${usage.outputTokens ?? "?"} ` +
          `cache_lectura=${usage.inputTokenDetails.cacheReadTokens ?? 0} ` +
          `cache_escritura=${usage.inputTokenDetails.cacheWriteTokens ?? 0} ` +
          `restantes_hoy=${cupo.restantes}`,
      );

      if (conversacionId && text) {
        await registrar(() =>
          guardarRespuesta(actor, conversacionId, text, {
            modelo: MODELO,
            entrada: usage.inputTokens,
            salida: usage.outputTokens,
            cache: usage.inputTokenDetails.cacheReadTokens,
          }),
        );
      }
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
