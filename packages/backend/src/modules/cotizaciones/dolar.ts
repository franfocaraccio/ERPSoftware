import { z } from "zod";

/**
 * Cotizaciones del dólar, con sus dos puntas y la variación del día.
 *
 * **De dónde salen.** La API del BCRA publica un solo número: la variable 4 es
 * el "tipo de cambio minorista (promedio vendedor)", un promedio de la punta
 * vendedora. No hay compra ausente de la respuesta — no existe en esa serie.
 *
 * Ámbito releva las dos puntas y su **venta del oficial es exactamente la del
 * BCRA**: 1537,18 contra 1537,18 para el 09/10/2026, hasta el centavo. Su
 * endpoint `/dolar/bcra/variacion` devuelve estos mismos valores. O sea que
 * esto no resigna la cifra oficial, le suma la compra que el BCRA no publica.
 *
 * Si alguna vez hace falta otra plaza, agregarla acá alcanza:
 * `/dolar/mayorista/variacion` da el A3500 (su venta también coincide con el
 * BCRA) y `/dolarnacion/variacion` el del Banco Nación.
 */
const FUENTES = {
  oficial: "https://mercados.ambito.com/dolar/oficial/variacion",
  blue: "https://mercados.ambito.com/dolar/informal/variacion",
} as const;

export type Plaza = keyof typeof FUENTES;

/**
 * Ámbito rechaza con 403 los pedidos sin User-Agent, y `fetch` de Node no manda
 * ninguno. No nos hacemos pasar por un navegador: alcanza con identificarse, y
 * decir quién llama es lo correcto igual.
 */
const USER_AGENT = "ERP-PyME/1.0 (cotizacion dolar)";

/** Cuánto esperamos antes de rendirnos. El panel no puede colgarse. */
const TIMEOUT_MS = 8000;

/**
 * Cuánto se considera fresca una cotización. El oficial se mueve una vez por
 * día hábil; el blue durante la rueda, pero no tanto como para justificar una
 * consulta por request.
 */
const VIGENCIA_MS = 30 * 60 * 1000;

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

/** "-0,14%" → "-0.14". El signo se conserva: es lo que define la flecha. */
function aPorcentaje(valor: string): string {
  return aDecimal(valor.replace("%", ""));
}

/** "09/10/2026 - 15:50" → "2026-10-09", que es el formato del resto del sistema. */
function aIso(valor: string): string {
  const [dia, mes, anio] = valor.trim().slice(0, 10).split("/");
  if (!dia || !mes || !anio || anio.length !== 4) {
    throw new Error(`Fecha con formato inesperado: ${valor}`);
  }
  return `${anio}-${mes}-${dia}`;
}

/** Hacia dónde se movió respecto del cierre anterior. */
export type Tendencia = "sube" | "baja" | "igual";

const TENDENCIAS: Record<string, Tendencia> = { up: "sube", down: "baja", equal: "igual" };

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
    variacion: z.string(),
    "class-variacion": z.string(),
  })
  .transform((d) => ({
    compra: aDecimal(d.compra),
    venta: aDecimal(d.venta),
    fecha: aIso(d.fecha),
    variacion: aPorcentaje(d.variacion),
    // Una clase que no conocemos no es motivo para descartar la cotización: el
    // importe sigue siendo bueno y la flecha es un agregado informativo.
    tendencia: TENDENCIAS[d["class-variacion"]] ?? "igual",
  }));

export interface Cotizacion {
  /** Los valores como string: los decimales no viajan ni se operan como number. */
  compra: string;
  venta: string;
  /** Día de la cotización, en ISO. */
  fecha: string;
  /** Variación contra el cierre anterior, en porcentaje y con signo. */
  variacion: string;
  tendencia: Tendencia;
}

/**
 * Una plaza puede faltar sin arrastrar a la otra: si Ámbito falla solo para el
 * blue, el oficial se muestra igual.
 */
export type Cotizaciones = Record<Plaza, Cotizacion | null>;

interface Cacheado {
  cotizaciones: Cotizaciones;
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

async function traerPlaza(
  plaza: Plaza,
  traer: typeof fetch,
  anterior: Cotizacion | null,
): Promise<Cotizacion | null> {
  try {
    const respuesta = await traer(FUENTES[plaza], {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      console.error(`[dolar] ${plaza}: la fuente respondió ${respuesta.status}`);
      return anterior;
    }
    return respuestaSchema.parse(await respuesta.json());
  } catch (error) {
    console.error(`[dolar] ${plaza}: no se pudo leer la cotización:`, error);
    // Si había una cotización vieja, mostrarla con su fecha es mejor que no
    // mostrar nada: el usuario ve de cuándo es y decide.
    return anterior;
  }
}

/** Las cotizaciones del dólar. Cada plaza puede venir en null por su cuenta. */
export async function cotizacionesDolar(
  ahora: () => number = Date.now,
  traer: typeof fetch = fetch,
): Promise<Cotizaciones> {
  if (cache && cache.expira > ahora()) {
    return cache.cotizaciones;
  }

  const previas = cache?.cotizaciones;
  const [oficial, blue] = await Promise.all([
    traerPlaza("oficial", traer, previas?.oficial ?? null),
    traerPlaza("blue", traer, previas?.blue ?? null),
  ]);

  const cotizaciones: Cotizaciones = { oficial, blue };
  // Solo se cachea si se consiguió algo: con las dos caídas conviene reintentar
  // en la próxima visita en vez de esperar media hora.
  if (oficial || blue) {
    cache = { cotizaciones, expira: ahora() + VIGENCIA_MS };
  }
  return cotizaciones;
}
