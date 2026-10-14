import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ArchivoNoLegibleError, leerHojaXlsx } from "./xlsx.js";

/**
 * Los Excel de estos tests se arman acá, a mano. No se usa el extracto real:
 * lleva movimientos, nombres y CUIT de personas.
 *
 * La forma del de Galicia está **copiada del archivo, no supuesta**. La
 * primera versión de estos tests usaba texto en línea y etiquetas sin prefijo,
 * que es como yo creía que venía. Pasaban todos, y el archivo real devolvía
 * cero filas.
 */

const BOM = "\uFEFF";
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const NS_X = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

function xlsx(hoja: string, extras: Record<string, string> = {}): Uint8Array {
  const archivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`${BOM}<?xml version="1.0"?><Types/>`),
    "xl/workbook.xml": strToU8(`${BOM}<?xml version="1.0"?><x:workbook ${NS_X}/>`),
    "xl/worksheets/sheet1.xml": strToU8(hoja),
  };
  for (const [ruta, contenido] of Object.entries(extras)) {
    archivos[ruta] = strToU8(contenido);
  }
  return zipSync(archivos);
}

/**
 * Una celda exactamente como las del extracto de Galicia: prefijo `x:`, tipo
 * `str`, el texto en `<x:v>` y sin referencia de columna. Son las 1.397 del
 * archivo real, todas iguales.
 */
const celdaGalicia = (texto: string) => `<x:c s="0" t="str"><x:v>${texto}</x:v></x:c>`;

/** Una hoja con la forma de Galicia: BOM, prefijo `x:` y celdas sin referencia. */
function hojaGalicia(...filas: string[][]): string {
  const cuerpo = filas.map((fila) => `<x:row>${fila.map(celdaGalicia).join("")}</x:row>`).join("");
  return `${BOM}<?xml version="1.0" encoding="utf-8"?><x:worksheet ${NS_X}><x:sheetData>${cuerpo}</x:sheetData></x:worksheet>`;
}

/** Texto en línea, sin prefijo: lo que usan otros generadores. */
const enLinea = (texto: string) =>
  `<c t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;

describe("leerHojaXlsx", () => {
  it("lee el formato de Galicia: BOM, prefijo x: y celdas sin referencia", () => {
    // Las tres rarezas juntas, como vienen en el archivo real. Cada una por sí
    // sola alcanza para que una librería común no lea nada.
    const hoja = hojaGalicia(
      ["Fecha", "Movimiento", "Débito"],
      ["13/10/2026", " COMPRA DEBITO\n Market\n", "-2.881,50"],
    );

    expect(leerHojaXlsx(xlsx(hoja))).toEqual([
      ["Fecha", "Movimiento", "Débito"],
      ["13/10/2026", " COMPRA DEBITO\n Market\n", "-2.881,50"],
    ]);
  });

  it("sin sacar el prefijo x: no encontraría ni una fila", () => {
    // El error de esta rareza es silencioso: no tira, devuelve una hoja vacía.
    // Por eso se prueba aparte que haya filas, no sólo que no explote.
    expect(leerHojaXlsx(xlsx(hojaGalicia(["a"], ["b"], ["c"])))).toHaveLength(3);
  });

  it("conserva el texto tal cual: espacios, saltos de línea y ceros", () => {
    // La descripción de un movimiento viene en varias líneas, y "0,00" tiene
    // que seguir siendo "0,00" y no volverse un 0.
    expect(leerHojaXlsx(xlsx(hojaGalicia(["  a\n  b  ", "0,00"])))[0]).toEqual([
      "  a\n  b  ",
      "0,00",
    ]);
  });

  it("un número sin punto de miles sigue siendo texto", () => {
    // El saldo de Galicia viene como "4824,35" y "47336,2": tiene que llegar
    // igual, no convertido en un número que pierda la coma.
    expect(leerHojaXlsx(xlsx(hojaGalicia(["4824,35", "47336,2"])))[0]).toEqual([
      "4824,35",
      "47336,2",
    ]);
  });

  it("también lee texto en línea, que es lo que usan otros generadores", () => {
    const hoja = `<worksheet ${NS}><sheetData><row>${enLinea("Fecha")}</row></sheetData></worksheet>`;
    expect(leerHojaXlsx(xlsx(hoja))[0]).toEqual(["Fecha"]);
  });

  it("lee también el formato normal, con referencias y textos compartidos", () => {
    // El próximo banco puede exportar como Excel manda: no se puede depender
    // de las rarezas de uno.
    const hoja = `<worksheet ${NS}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1500.5</v></c></row>
    </sheetData></worksheet>`;
    const compartidas = `<sst ${NS}><si><t>Saldo</t></si></sst>`;
    expect(leerHojaXlsx(xlsx(hoja, { "xl/sharedStrings.xml": compartidas }))).toEqual([
      ["Saldo", "1500.5"],
    ]);
  });

  it("respeta la columna cuando hay referencias, aunque falten celdas", () => {
    const hoja = `<worksheet ${NS}><sheetData>
      <row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>
    </sheetData></worksheet>`;
    expect(leerHojaXlsx(xlsx(hoja))[0]).toEqual(["1", null, "3"]);
  });

  it("une un texto con formato que viene partido en tramos", () => {
    const hoja = `<worksheet ${NS}><sheetData><row>
      <c t="inlineStr"><is><r><t>CREDITO </t></r><r><t>TRANSFERENCIA</t></r></is></c>
    </row></sheetData></worksheet>`;
    expect(leerHojaXlsx(xlsx(hoja))[0]).toEqual(["CREDITO TRANSFERENCIA"]);
  });

  it("decodifica los caracteres escapados del XML", () => {
    expect(leerHojaXlsx(xlsx(hojaGalicia(["Pérez &amp; Hijos"])))[0]).toEqual(["Pérez & Hijos"]);
  });

  it("una hoja de una sola fila sigue siendo una lista de filas", () => {
    expect(leerHojaXlsx(xlsx(hojaGalicia(["única"])))).toEqual([["única"]]);
  });

  it("algo que no es un Excel se rechaza con un error que se entiende", () => {
    expect(() => leerHojaXlsx(new TextEncoder().encode("no soy un zip"))).toThrow(
      ArchivoNoLegibleError,
    );
  });

  it("un zip sin hojas también", () => {
    expect(() => leerHojaXlsx(zipSync({ "otra.txt": strToU8("x") }))).toThrow(
      ArchivoNoLegibleError,
    );
  });
});
