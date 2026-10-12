import { z } from "zod";

/**
 * Cotización del dólar oficial, con sus dos puntas.
 *
 * **Por qué no es el BCRA.** La primera versión leía la variable 4 del BCRA,
 * "tipo de cambio minorista (promedio vendedor)". Ese dato es un promedio de la
 * punta vendedora: devuelve un solo número y no tiene compra, no porque falte
 * en la respuesta sino porque el BCRA no publica las dos puntas. Mostrar compra
 * y venta exige una fuente que las releve de las casas de cambio.
 *
 * El costo del cambio es la procedencia: `dolarapi.com` es un agregador público
 * y gratuito, no un organismo oficial. Para un dato informativo al costado del
 * panel —nada del sistema convierte importes con esto— el intercambio cierra.
 * Si alguna vez se usa para valuar comprobantes, hay que volver a una fuente
 * oficial y asumir que será un solo valor.
 */
const URL_DOLAR = "https://dolarapi.com/v1/dolares/oficial";

/**
 * La respuesta pasa por Zod antes de tocar nada, como todo input externo. Si
 * cambian la forma, preferimos no mostrar cotización antes que mostrar
 * cualquier cosa.
 */
const respuestaSchema = z.object({
  compra: z.number(),
  venta: z.number(),
  fechaActualizacion: z.string(),
});

export interface Cotizacion {
  /** Los valores como string: los decimales no viajan ni se operan como number. */
  compra: string;
  venta: string;
  /** Cuándo se actualizó la cotización, en ISO. */
  fecha: string;
}

/**
 * Cuánto se considera fresca una cotización.
 *
 * El oficial se mueve una vez por día hábil, así que consultar seguido no
 * aporta nada y suma una dependencia externa en el camino de cada request.
 */
const VIGENCIA_MS = 60 * 60 * 1000;

/** Cuánto esperamos antes de rendirnos. El panel no puede colgarse. */
const TIMEOUT_MS = 8000;

interface Cacheado {
  cotizacion: Cotizacion;
  expira: number;
}

/**
 * Cache en memoria, igual que el tope del asistente: se reinicia con cada
 * deploy y no se comparte entre instancias. Es aceptable porque el dato es
 * público e igual para todos los tenants, y el peor caso es una consulta de
 * más.
 */
let cache: Cacheado | null = null;

/** Para los tests: deja la cache como recién arrancada. */
export function limpiarCache(): void {
  cache = null;
}

/**
 * La cotización del dólar oficial, o null si la fuente no contesta.
 *
 * Devuelve null en vez de tirar: es un dato informativo al costado del panel, y
 * que una API externa esté caída no puede dejar sin panel a nadie.
 */
export async function dolarOficial(
  ahora: () => number = Date.now,
  traer: typeof fetch = fetch,
): Promise<Cotizacion | null> {
  if (cache && cache.expira > ahora()) {
    return cache.cotizacion;
  }

  try {
    const respuesta = await traer(URL_DOLAR, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!respuesta.ok) {
      console.error(`[dolar] la fuente respondió ${respuesta.status}`);
      return cache?.cotizacion ?? null;
    }

    const datos = respuestaSchema.parse(await respuesta.json());
    const cotizacion: Cotizacion = {
      // JSON no tiene decimales exactos, así que los números llegan como float
      // y se fijan acá. A partir de estos strings cualquier cuenta va con Money.
      compra: datos.compra.toFixed(2),
      venta: datos.venta.toFixed(2),
      fecha: datos.fechaActualizacion,
    };
    cache = { cotizacion, expira: ahora() + VIGENCIA_MS };
    return cotizacion;
  } catch (error) {
    console.error("[dolar] no se pudo leer la cotización:", error);
    // Si había una cotización vieja, mostrarla con su fecha es mejor que no
    // mostrar nada: el usuario ve de cuándo es y decide.
    return cache?.cotizacion ?? null;
  }
}
