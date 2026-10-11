import { z } from "zod";

/**
 * Cotización del dólar oficial, publicada por el BCRA.
 *
 * Se usa el **tipo de cambio minorista (promedio vendedor)**, que es lo que en
 * la calle se llama "el dólar oficial". El BCRA publica además el mayorista de
 * referencia (A3500, variable 5), bastante más bajo: a la misma fecha, 1537,18
 * contra 1515,88. Si alguna vez hace falta el mayorista —que es el que se usa
 * para valuar comprobantes en moneda extranjera— alcanza con cambiar esta
 * constante.
 */
const VARIABLE_MINORISTA = 4;

const URL_BCRA = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${VARIABLE_MINORISTA}?limit=10`;

/**
 * La respuesta del BCRA pasa por Zod antes de tocar nada, como todo input
 * externo. Si cambian la forma, preferimos no mostrar la cotización antes que
 * mostrar cualquier cosa.
 */
const respuestaSchema = z.object({
  results: z
    .array(
      z.object({
        detalle: z
          .array(z.object({ fecha: z.string(), valor: z.number() }))
          .min(1, "El BCRA no devolvió ningún valor"),
      }),
    )
    .min(1, "El BCRA no devolvió ninguna serie"),
});

export interface Cotizacion {
  /** El valor como string: los decimales no viajan ni se operan como number. */
  valor: string;
  /** Fecha de la publicación, no de hoy: el BCRA publica por día hábil. */
  fecha: string;
}

/**
 * Cuánto se considera fresca una cotización.
 *
 * El BCRA publica una vez por día hábil, así que consultarlo seguido no aporta
 * nada y suma una dependencia externa en el camino de cada request. Una hora
 * deja el dato al día sin castigar a nadie.
 */
const VIGENCIA_MS = 60 * 60 * 1000;

/** Cuánto esperamos al BCRA antes de rendirnos. El panel no puede colgarse. */
const TIMEOUT_MS = 8000;

interface Cacheado {
  cotizacion: Cotizacion;
  expira: number;
}

/**
 * Cache en memoria, igual que el tope del asistente: se reinicia con cada
 * deploy y no se comparte entre instancias. Es aceptable porque el dato es
 * público e igual para todos los tenants, y el peor caso es una consulta de más
 * al BCRA.
 */
let cache: Cacheado | null = null;

/** Para los tests: deja la cache como recién arrancada. */
export function limpiarCache(): void {
  cache = null;
}

/**
 * La cotización del dólar oficial, o null si el BCRA no contesta.
 *
 * Devuelve null en vez de tirar: es un dato informativo al costado del panel, y
 * que el BCRA esté caído no puede dejar sin panel a nadie.
 */
export async function dolarOficial(
  ahora: () => number = Date.now,
  traer: typeof fetch = fetch,
): Promise<Cotizacion | null> {
  if (cache && cache.expira > ahora()) {
    return cache.cotizacion;
  }

  try {
    const respuesta = await traer(URL_BCRA, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!respuesta.ok) {
      console.error(`[bcra] respondió ${respuesta.status}`);
      return cache?.cotizacion ?? null;
    }

    const datos = respuestaSchema.parse(await respuesta.json());
    // La serie viene de la más reciente a la más vieja.
    const ultimo = datos.results[0]?.detalle[0];
    if (!ultimo) {
      return cache?.cotizacion ?? null;
    }

    const cotizacion: Cotizacion = {
      // JSON no tiene decimales exactos, así que el número llega como float y
      // lo fijamos acá. A partir de este string cualquier cuenta va con Money.
      valor: ultimo.valor.toFixed(2),
      fecha: ultimo.fecha,
    };
    cache = { cotizacion, expira: ahora() + VIGENCIA_MS };
    return cotizacion;
  } catch (error) {
    console.error("[bcra] no se pudo leer la cotización:", error);
    // Si había una cotización vieja, mostrarla con su fecha es mejor que no
    // mostrar nada: el usuario ve de cuándo es y decide.
    return cache?.cotizacion ?? null;
  }
}
