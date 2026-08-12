import { describe, expect, it } from "vitest";
import { type ColumnaExport, generarCsv } from "./exportar.js";

interface Fila {
  razonSocial: string;
  cuit: string | null;
  limite: string | null;
  fecha: string | null;
}

const COLUMNAS: ColumnaExport<Fila>[] = [
  { encabezado: "Razón social", valor: (f) => f.razonSocial, tipo: "texto" },
  { encabezado: "CUIT", valor: (f) => f.cuit, tipo: "codigo" },
  { encabezado: "Límite", valor: (f) => f.limite, tipo: "dinero" },
  { encabezado: "Vencimiento", valor: (f) => f.fecha, tipo: "fecha" },
];

const fila = (extra: Partial<Fila> = {}): Fila => ({
  razonSocial: "Ferretería MyH",
  cuit: "20123456789",
  limite: "1500000.50",
  fecha: "2026-08-11",
  ...extra,
});

/** El contenido sin el BOM, para comparar sin arrastrarlo en cada aserción. */
function sinBom(csv: string): string {
  return csv.replace(/^﻿/, "");
}

describe("generarCsv", () => {
  it("arranca con BOM", () => {
    // Sin esto Excel abre el archivo como Latin-1 y las tildes se rompen.
    expect(generarCsv([fila()], COLUMNAS).startsWith("﻿")).toBe(true);
  });

  it("separa con punto y coma, no con coma", () => {
    // La coma ya está ocupada como separador decimal: usarla también para
    // separar columnas partiría cada importe en dos celdas.
    const [encabezados] = sinBom(generarCsv([], COLUMNAS)).split("\r\n");

    expect(encabezados).toBe('"Razón social";"CUIT";"Límite";"Vencimiento"');
  });

  it("escribe los importes con coma decimal y dos decimales", () => {
    const linea = sinBom(generarCsv([fila()], COLUMNAS)).split("\r\n")[1];

    expect(linea).toContain('"1500000,50"');
  });

  it("no le pone separador de miles a los importes", () => {
    // Con separador de miles Excel es-AR lo tomaría como texto y no se podría
    // sumar, que es todo el punto de exportar a una planilla.
    const linea = sinBom(generarCsv([fila({ limite: "1234567.89" })], COLUMNAS)).split("\r\n")[1];

    expect(linea).toContain('"1234567,89"');
    expect(linea).not.toContain("1.234.567");
  });

  it("escribe las fechas en formato argentino", () => {
    const linea = sinBom(generarCsv([fila()], COLUMNAS)).split("\r\n")[1];

    expect(linea).toContain('"11/8/2026"');
  });

  it("no corre un día las fechas sin hora", () => {
    // `2026-08-11` se parsea como medianoche UTC; mostrarla en Argentina la
    // devolvía como 10/8. Un vencimiento exportado con un día de menos es el
    // tipo de error que nadie revisa hasta que llega el recargo.
    for (const dia of ["2026-01-01", "2026-08-11", "2026-12-31"]) {
      const linea = sinBom(generarCsv([fila({ fecha: dia })], COLUMNAS)).split("\r\n")[1];
      const [ano, mes, d] = dia.split("-").map(Number);
      expect(linea).toContain(`"${d}/${mes}/${ano}"`);
    }
  });

  it("pasa a hora argentina las fechas que sí traen hora", () => {
    // Un instante real sí tiene zona: 02:30 UTC del 12 son las 23:30 del 11 acá.
    const linea = sinBom(generarCsv([fila({ fecha: "2026-08-12T02:30:00.000Z" })], COLUMNAS)).split(
      "\r\n",
    )[1];

    expect(linea).toContain('"11/8/2026"');
  });

  it("deja el CUIT tal cual, sin convertirlo a número", () => {
    const linea = sinBom(generarCsv([fila()], COLUMNAS)).split("\r\n")[1];

    expect(linea).toContain('"20123456789"');
  });

  it("deja vacías las celdas nulas en vez de escribir cero", () => {
    // Un límite sin definir no es un límite de cero: si se exportara como 0,
    // cualquier suma o promedio de la planilla daría mal.
    const linea = sinBom(
      generarCsv([fila({ limite: null, cuit: null, fecha: null })], COLUMNAS),
    ).split("\r\n")[1];

    expect(linea).toBe('"Ferretería MyH";"";"";""');
  });

  it("escapa las comillas duplicándolas", () => {
    const linea = sinBom(generarCsv([fila({ razonSocial: 'El "Rápido" SA' })], COLUMNAS)).split(
      "\r\n",
    )[1];

    expect(linea?.startsWith('"El ""Rápido"" SA"')).toBe(true);
  });

  it("no rompe la fila cuando el texto trae el separador o un salto de línea", () => {
    const csv = sinBom(generarCsv([fila({ razonSocial: "Uno;Dos\nTres" })], COLUMNAS));

    // Va todo dentro de las comillas: la fila sigue siendo una sola celda.
    expect(csv).toContain('"Uno;Dos\nTres"');
  });

  it("termina las líneas con CRLF", () => {
    expect(sinBom(generarCsv([fila()], COLUMNAS))).toContain("\r\n");
  });

  it("con lista vacía deja solo los encabezados", () => {
    expect(sinBom(generarCsv([], COLUMNAS)).split("\r\n")).toHaveLength(1);
  });
});
