import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { Actor } from "../../db/auditar.js";
import { crearContador, diaEnArgentina } from "../asistente/limite.js";
import { armarHechos } from "./hechos.js";

/** El mismo modelo que el asistente: redactar sobre números dados no necesita más. */
const MODELO = process.env.ASISTENTE_MODELO ?? "gpt-5.4-mini";

/**
 * Tope por empresa y por día, aparte del del chat: es la única pantalla del
 * panel que cuesta plata en cada clic. Vive en memoria (se reinicia con cada
 * deploy), como el del asistente.
 */
const consumirCupo = crearContador({
  limite: Number(process.env.EXPLICACION_LIMITE_DIARIO ?? 10),
});

/** Una explicación por empresa y por día: los números del mes no cambian a cada rato. */
const cache = new Map<string, { dia: string; explicacion: Explicacion }>();

export interface Explicacion {
  texto: string;
  periodo: string;
  generada: string;
  /** Los hechos con los que se escribió, para que se pueda verificar el texto. */
  hechos: string[];
}

export class ExplicacionNoDisponibleError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ExplicacionNoDisponibleError";
  }
}

export function explicacionHabilitada(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const INSTRUCCIONES = `Sos el analista financiero de una PyME argentina. Te paso hechos del último mes cerrado comparado con el anterior, ya calculados por el sistema.

Escribí entre 3 y 5 oraciones en castellano rioplatense, claras, para el dueño de la empresa:
- Qué pasó con las ventas, el margen y el resultado.
- Cuál es la causa más probable, SÓLO si surge de los hechos (por ejemplo, una categoría cuyo margen cayó, o un gasto que subió).
- Si hay una alerta de caja, mencionala primero.

Reglas que no podés romper:
- Usá únicamente los números que aparecen en los hechos, tal como están escritos. No calcules, no redondees, no inventes cifras.
- Si un hecho no explica una variación, no supongas causas externas: decí que conviene revisarlo.
- Sin títulos, sin viñetas, sin saludos.`;

/** La respuesta de un modelo es input externo: pasa por Zod antes de mostrarse. */
const respuestaSchema = z.string().trim().min(20).max(2000);

/**
 * Un texto que explica los números del mes. El modelo sólo redacta: los
 * números y las comparaciones salen de core (`armarHechos`).
 */
export async function explicarMes(
  actor: Actor,
  redactar: (instrucciones: string, prompt: string) => Promise<string> = async (
    instrucciones,
    prompt,
  ) => (await generateText({ model: openai(MODELO), instructions: instrucciones, prompt })).text,
  hoy: () => Date = () => new Date(),
): Promise<Explicacion> {
  const dia = diaEnArgentina(hoy());
  const guardada = cache.get(actor.tenantId);
  if (guardada && guardada.dia === dia) {
    return guardada.explicacion;
  }

  const hechos = await armarHechos(actor);
  if (hechos.lineas.length === 0) {
    throw new ExplicacionNoDisponibleError(
      "Todavía no hay dos meses cerrados con movimientos para comparar.",
    );
  }

  const cupo = consumirCupo(actor.tenantId);
  if (!cupo.permitido) {
    throw new ExplicacionNoDisponibleError(
      `Se usaron las ${cupo.limite} explicaciones del día. Se renueva mañana.`,
    );
  }

  const crudo = await redactar(
    INSTRUCCIONES,
    `Hechos (${hechos.periodo} contra ${hechos.periodoAnterior}):\n- ${hechos.lineas.join("\n- ")}`,
  );
  const parseo = respuestaSchema.safeParse(crudo);
  if (!parseo.success) {
    throw new ExplicacionNoDisponibleError("El modelo no devolvió una explicación válida.");
  }

  const explicacion: Explicacion = {
    texto: parseo.data,
    periodo: hechos.periodo,
    generada: hoy().toISOString(),
    hechos: hechos.lineas,
  };
  cache.set(actor.tenantId, { dia, explicacion });
  return explicacion;
}

/** Para los tests: sin explicaciones guardadas. */
export function limpiarCacheExplicaciones(): void {
  cache.clear();
}
