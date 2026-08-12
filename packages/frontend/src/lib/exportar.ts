/**
 * Generación de archivos para exportar un listado.
 *
 * El problema real no es armar el archivo: es que Excel reinterpreta lo que le
 * mandás. Un CUIT `20123456789` se abre como `2,01235E+10`; un SKU `0012`
 * pierde el cero; uno que se llame `1-2` se convierte en fecha. Por eso cada
 * columna declara su tipo y el tipo decide cómo se escribe la celda: los
 * códigos van como texto explícito y solo los importes van como número.
 *
 * En XLSX eso se puede controlar. En CSV **no hay forma portable de hacerlo**
 * —el truco `="..."` es de Excel y rompe en Google Sheets y LibreOffice—, así
 * que el CSV se ofrece para llevar los datos a otro sistema y el XLSX es el
 * formato para abrir y mirar.
 */

import type { CellObject, Row } from "write-excel-file/browser";

export type TipoColumna = "texto" | "codigo" | "dinero" | "numero" | "fecha";

export interface ColumnaExport<T> {
  encabezado: string;
  /** Valor crudo, sin formatear. Los importes viajan como string, igual que en la API. */
  valor: (fila: T) => string | number | null | undefined;
  tipo: TipoColumna;
  /** Ancho de la columna en Excel, en caracteres. */
  ancho?: number;
}

/** Excel es-AR: coma decimal y punto de miles los pone el formato, no el valor. */
const FORMATO_DINERO = "#,##0.00";
const FORMATO_FECHA = "dd/mm/yyyy";

function nombreDeArchivo(base: string, extension: string): string {
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${base}-${hoy}.${extension}`;
}

/**
 * Los importes llegan como string desde la API y se convierten a número solo
 * acá, para que Excel pueda sumarlos: una celda de texto no se suma, y una
 * planilla de importes que no se pueden sumar no sirve para nada.
 *
 * Es el mismo borde de presentación que `formatearImporte`, no un cálculo. Un
 * double representa exacto cualquier importe de dos decimales hasta el orden de
 * 10^13, muy por encima de lo que puede facturar una PyME.
 */
function aNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Una fecha sin hora (`2026-08-11`) no tiene zona horaria: es el día que
 * alguien escribió en un formulario. `new Date("2026-08-11")` la interpreta
 * como medianoche UTC, y mostrarla en Argentina (UTC-3) la corre al día
 * anterior — un vencimiento del 11 se exportaba como 10.
 *
 * Por eso estas se mantienen y se muestran en UTC, sin convertir. Las que sí
 * traen hora (el historial, por ejemplo) son instantes reales y esas sí se
 * pasan a hora argentina.
 */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface FechaExport {
  fecha: Date;
  zona: "UTC" | "America/Argentina/Buenos_Aires";
}

function aFecha(valor: string | number | null | undefined): FechaExport | null {
  if (!valor) {
    return null;
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return {
    fecha: d,
    zona:
      typeof valor === "string" && SOLO_FECHA.test(valor)
        ? "UTC"
        : "America/Argentina/Buenos_Aires",
  };
}

// --- Excel -------------------------------------------------------------------

export async function descargarExcel<T>(
  filas: T[],
  columnas: ColumnaExport<T>[],
  nombre: string,
): Promise<void> {
  // Dinámico: la librería pesa cerca de un mega y no tiene por qué pagarla
  // quien nunca exporta. El subpath `/browser` es obligatorio — el paquete no
  // expone raíz, y la variante de Node no corre acá.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const encabezado: Row = columnas.map((c) => ({
    value: c.encabezado,
    fontWeight: "bold" as const,
  }));

  // Una celda vacía se escribe omitiendo `value`, no mandando `undefined`:
  // con `exactOptionalPropertyTypes` no son lo mismo.
  const cuerpo: Row[] = filas.map((fila) =>
    columnas.map((columna): CellObject => {
      const crudo = columna.valor(fila);

      switch (columna.tipo) {
        case "dinero": {
          const n = aNumero(crudo);
          return n === null ? {} : { value: n, type: Number, format: FORMATO_DINERO };
        }
        case "numero": {
          const n = aNumero(crudo);
          return n === null ? {} : { value: n, type: Number };
        }
        case "fecha": {
          const d = aFecha(crudo);
          return d === null ? {} : { value: d.fecha, type: Date, format: FORMATO_FECHA };
        }
        // `codigo` es lo que Excel destroza si lo dejás adivinar: CUITs, SKUs,
        // CBUs, números de cheque. Van como texto sí o sí.
        default:
          return crudo === null || crudo === undefined ? {} : { value: String(crudo) };
      }
    }),
  );

  await writeXlsxFile([encabezado, ...cuerpo], {
    columns: columnas.map((c) => ({ width: c.ancho ?? 18 })),
  }).toFile(nombreDeArchivo(nombre, "xlsx"));
}

// --- CSV ---------------------------------------------------------------------

/**
 * Punto y coma como separador: Excel en español espera eso, y con coma decimal
 * la coma separadora sería ambigua.
 */
const SEPARADOR = ";";

function celdaCsv(texto: string): string {
  return `"${texto.replaceAll('"', '""')}"`;
}

function valorCsv<T>(fila: T, columna: ColumnaExport<T>): string {
  const crudo = columna.valor(fila);
  if (crudo === null || crudo === undefined) {
    return "";
  }

  switch (columna.tipo) {
    case "dinero":
    case "numero": {
      // Coma decimal, sin separador de miles: así Excel es-AR lo toma como
      // número y no como texto.
      const n = aNumero(crudo);
      return n === null
        ? ""
        : String(columna.tipo === "dinero" ? n.toFixed(2) : n).replace(".", ",");
    }
    case "fecha": {
      const d = aFecha(crudo);
      return d === null ? "" : d.fecha.toLocaleDateString("es-AR", { timeZone: d.zona });
    }
    default:
      return String(crudo);
  }
}

/**
 * El contenido del CSV, sin tocar el DOM. Separado de la descarga para poder
 * probarlo: el formato de los importes y el escapado son justo lo que se rompe
 * en silencio y solo se nota al abrir el archivo.
 */
export function generarCsv<T>(filas: T[], columnas: ColumnaExport<T>[]): string {
  const lineas = [
    columnas.map((c) => celdaCsv(c.encabezado)).join(SEPARADOR),
    ...filas.map((fila) => columnas.map((c) => celdaCsv(valorCsv(fila, c))).join(SEPARADOR)),
  ];

  // El BOM no es opcional: sin él Excel abre el archivo como Latin-1 y
  // "Razón social" se ve "RazÃ³n social".
  return `﻿${lineas.join("\r\n")}`;
}

export function descargarCsv<T>(filas: T[], columnas: ColumnaExport<T>[], nombre: string): void {
  const blob = new Blob([generarCsv(filas, columnas)], { type: "text/csv;charset=utf-8" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreDeArchivo(nombre, "csv");
  a.click();
  URL.revokeObjectURL(url);
}
