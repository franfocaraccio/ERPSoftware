import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";

/**
 * Lector mínimo de la primera hoja de un `.xlsx`, devuelta como filas de texto.
 *
 * Existe porque ninguna librería común lee el extracto de Galicia. Su Excel
 * tiene dos rarezas, las dos válidas según el estándar pero que casi nadie
 * espera:
 *
 * - **Los XML empiezan con un BOM**, un carácter invisible antes de `<?xml`.
 *   Con eso `exceljs` no encuentra el libro y se cae.
 * - **Las celdas no traen su referencia** (`r="B7"`): van por posición. Con
 *   eso `read-excel-file` se cae buscando una columna que no está.
 * - **Todas las etiquetas llevan prefijo de espacio de nombres**: `<x:row>`,
 *   `<x:c>`, `<x:v>` en vez de `<row>`, `<c>`, `<v>`. Sin sacarlo no se
 *   encuentra ni una fila, y el error es silencioso: devuelve una hoja vacía.
 *
 * Esto acepta las dos cosas y también el caso normal, con referencias y con
 * textos compartidos, porque el próximo banco puede exportar distinto.
 *
 * Devuelve todo como texto, sin interpretar: "0,00" y "13/10/2026" siguen
 * siendo lo que dice el papel. Convertirlos es trabajo de quien sabe qué
 * columna es cada cosa.
 */

export type Celda = string | null;

export class ArchivoNoLegibleError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  // `<x:row>` pasa a ser `<row>`. Es lo que hace que el extracto de Galicia
  // tenga filas en vez de ninguna.
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
  // Siempre listas, aunque haya un solo elemento: si no, una hoja de una fila
  // devuelve un objeto donde se esperaba un arreglo.
  isArray: (nombre) => ["row", "c", "si", "r"].includes(nombre),
  // Los valores quedan como texto: "4824" no se vuelve un número ni pierde
  // los ceros de "0,00".
  parseTagValue: false,
  // El extracto guarda la descripción en varias líneas con espacios: se
  // conservan, y se recortan después, sabiendo qué es cada cosa.
  trimValues: false,
});

/** El contenido de un `<t>`, que con `xml:space` viene como objeto. */
function texto(nodo: unknown): string {
  if (nodo === undefined || nodo === null) {
    return "";
  }
  if (typeof nodo === "string" || typeof nodo === "number") {
    return String(nodo);
  }
  if (typeof nodo === "object" && "#text" in nodo) {
    return String((nodo as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

/** Un texto con formato viene partido en tramos `<r><t>…</t></r>`. */
function textoDeCadena(nodo: unknown): string {
  if (typeof nodo !== "object" || nodo === null) {
    return texto(nodo);
  }
  const n = nodo as { t?: unknown; r?: { t?: unknown }[] };
  if (n.r) {
    return n.r.map((tramo) => texto(tramo.t)).join("");
  }
  return texto(n.t);
}

/** "AB7" → 27. La columna, empezando en cero. */
function columna(referencia: string): number {
  const letras = /^[A-Z]+/.exec(referencia)?.[0] ?? "";
  let n = 0;
  for (const letra of letras) {
    n = n * 26 + (letra.charCodeAt(0) - 64);
  }
  return n - 1;
}

function leerXml(archivos: Record<string, Uint8Array>, ruta: string): unknown {
  const bytes = archivos[ruta];
  if (!bytes) {
    return null;
  }
  // El BOM es lo que tumba a exceljs. Este parser lo tolera solo, as\u00ED que
  // sacarlo es defensa y no lo cubre ning\u00FAn test: si se cambia de parser, que
  // no haga falta acordarse.
  return parser.parse(strFromU8(bytes).replace(/^\uFEFF/, ""));
}

export function leerHojaXlsx(bytes: Uint8Array): Celda[][] {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes);
  } catch {
    throw new ArchivoNoLegibleError("El archivo no es un Excel (.xlsx) válido.");
  }

  const hoja = Object.keys(archivos)
    .filter((ruta) => /^xl\/worksheets\/sheet\d+\.xml$/.test(ruta))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]))[0];
  if (!hoja) {
    throw new ArchivoNoLegibleError("El Excel no tiene ninguna hoja.");
  }

  const compartidas = leerXml(archivos, "xl/sharedStrings.xml") as {
    sst?: { si?: unknown[] };
  } | null;
  const textos = (compartidas?.sst?.si ?? []).map(textoDeCadena);

  const xml = leerXml(archivos, hoja) as {
    worksheet?: { sheetData?: { row?: { c?: Record<string, unknown>[] }[] } };
  };
  const filas = xml?.worksheet?.sheetData?.row ?? [];

  return filas.map((fila) => {
    const celdas: Celda[] = [];
    (fila.c ?? []).forEach((c, posicion) => {
      const referencia = c["@_r"];
      // Con referencia se respeta la columna; sin ella, vale la posición.
      const indice = typeof referencia === "string" ? columna(referencia) : posicion;
      const tipo = c["@_t"];
      let valor: Celda;
      if (tipo === "inlineStr") {
        valor = textoDeCadena(c.is);
      } else if (tipo === "s") {
        valor = textos[Number(texto(c.v))] ?? null;
      } else {
        valor = c.v === undefined ? null : texto(c.v);
      }
      celdas[indice] = valor;
    });
    // Un hueco entre celdas queda como null, no como `undefined`.
    return Array.from(celdas, (c) => c ?? null);
  });
}
