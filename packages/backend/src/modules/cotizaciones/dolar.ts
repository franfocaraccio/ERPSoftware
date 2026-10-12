import { z } from "zod";

/**
 * Cotización del dólar oficial, con sus dos puntas.
 *
 * **De dónde sale.** La API del BCRA publica un solo número: la variable 4 es
 * el "tipo de cambio minorista (promedio vendedor)", un promedio de la punta
 * vendedora. No hay compra ausente de la respuesta — no existe en esa serie.
 *
 * Ámbito releva las dos puntas y su **venta es exactamente la del BCRA**:
 * 1537,18 contra 1537,18 para el 09/10/2026, hasta el centavo. O sea que esto
 * no resigna la cifra oficial, le suma la compra que el BCRA no publica. Su
 * endpoint `/dolar/bcra/variacion` devuelve estos mismos valores.
 *
 * Si alguna vez hace falta otra punta, es cambiar esta constante:
 * `/dolar/mayorista/variacion` da el A3500 (y su venta también coincide con el
 * BCRA), `/dolarnacion/variacion` el del Banco Nación, `/dolar/informal` el
 * blue.
 */
const URL_DOLAR = "https://mercados.ambito.com/dolar/oficial/variacion";

/**
 * Ámbito rechaza con 403 los pedidos sin User-Agent, y `fetch` de Node no manda
 * ninguno. No nos hacemos pasar por un navegador: alcanza con identificarse, y
 * decir quién llama es lo correcto igual.
 */
const USER_AGENT = "ERP-PyME/1.0 (cotizacion dolar oficial)";

/** Cuánto esperamos antes de rendirnos. El panel no puede colgarse. */
const TIMEOUT_MS = 8000;

/**
 * Cuánto se considera fresca una cotización. El oficial se mueve una vez por
 * día hábil, así que consultar seguido no aporta y suma una dependencia externa
 * en el camino de cada request.
 */
const VIGENCIA_MS = 60 * 60 * 1000;

/**
 * "1.537,18" → "1537.18".
 *
 * Los importes llegan con formato argentino: punto de miles y coma decimal.
 * Devuelve el string normalizado, nunca un `number`: el valor sigue siendo
 * decimal y convertirlo a punto flotante acá reintroduce el error que el
 * proyecto evita en todos lados.
 */
function aDecimal(valor: string): string {
  const normalizado = valor.trim().replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    throw new Error(`Importe con formato inesperado: ${valor}`);
  }
  return normalizado;
}

/** "09/10/2026 - 15:50" → "2026-10-09", que es el formato del resto del sistema. */
function aIso(valor: string): string {
  const [dia, mes, anio] = valor.trim().slice(0, 10).split("/");
  if (!dia || !mes || !anio || anio.length !== 4) {
    throw new Error(`Fecha con formato inesperado: ${valor}`);
  }
  return `${anio}-${mes}-${dia}`;
}

/**
 * La respuesta pasa por Zod antes de tocar nada, como todo input externo. Si
 * cambian la forma —o el formato de los números— preferimos no mostrar
 * cotización antes que mostrar cualquier cosa.
 */
const respuestaSchema = z
  .object({
    compra: z.string(),
    venta: z.string(),
    fecha: z.string(),
  })
  .transform((d) => ({
    compra: aDecimal(d.compra),
    venta: aDecimal(d.venta),
    fecha: aIso(d.fecha),
  }));

export interface Cotizacion {
  /** Los valores como string: los decimales no viajan ni se operan como number. */
  compra: string;
  venta: string;
  /** Día de la cotización, en ISO. El oficial se publica por día hábil. */
  fecha: string;
}

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
    const respuesta = await traer(URL_DOLAR, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      console.error(`[dolar] la fuente respondió ${respuesta.status}`);
      return cache?.cotizacion ?? null;
    }

    const cotizacion = respuestaSchema.parse(await respuesta.json());
    cache = { cotizacion, expira: ahora() + VIGENCIA_MS };
    return cotizacion;
  } catch (error) {
    console.error("[dolar] no se pudo leer la cotización:", error);
    // Si había una cotización vieja, mostrarla con su fecha es mejor que no
    // mostrar nada: el usuario ve de cuándo es y decide.
    return cache?.cotizacion ?? null;
  }
}
