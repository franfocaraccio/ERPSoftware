import { describe, expect, it } from "vitest";
import { aFechaIso, aImporte, aNumeracion, cuitLeido } from "./lectura.js";

/**
 * Los casos salen de las tres facturas reales que trajo Fran. Cada formato de
 * acá está impreso tal cual en alguno de esos papeles: no hay ninguno inventado.
 */

describe("aImporte", () => {
  it("lee el formato argentino", () => {
    // Coma decimal y punto de miles, como lo imprimen los tres comprobantes.
    expect(aImporte("3500000,00")).toBe("3500000.00");
    expect(aImporte("7963,00")).toBe("7963.00");
    expect(aImporte("786.500,00")).toBe("786500.00");
    expect(aImporte("1.382,01")).toBe("1382.01");
  });

  it("tolera el signo, los espacios y el símbolo de moneda", () => {
    expect(aImporte(" $ 12.100,00 ")).toBe("12100.00");
    expect(aImporte("USD 10000,00")).toBe("10000.00");
    expect(aImporte("-500,50")).toBe("-500.50");
  });

  it("un entero sin decimales también es un importe", () => {
    expect(aImporte("3500000")).toBe("3500000");
  });

  it("devuelve null cuando no es un número, en vez de un cero", () => {
    // `Number("")` da 0 sin avisar, y un cero inventado en un importe es peor
    // que un campo vacío: el formulario lo muestra como un dato cargado.
    for (const basura of ["", "   ", "—", "N/A", "mil quinientos", "1,2,3"]) {
      expect(aImporte(basura)).toBeNull();
    }
  });

  it("no confunde el punto de miles con un decimal", () => {
    // "1.234" en Argentina es mil doscientos treinta y cuatro, no 1,234.
    expect(aImporte("1.234")).toBe("1234");
  });
});

describe("aFechaIso", () => {
  it("convierte dd/mm/aaaa", () => {
    expect(aFechaIso("09/10/2026")).toBe("2026-10-09");
    expect(aFechaIso("21/09/2026")).toBe("2026-09-21");
    expect(aFechaIso("13/10/2020")).toBe("2020-10-13");
  });

  it("acepta un día o un mes de una cifra", () => {
    // Farmcity imprime "Fecha de Trabajo: 21/9/2026" junto a la otra.
    expect(aFechaIso("21/9/2026")).toBe("2026-09-21");
    expect(aFechaIso("1/1/1900")).toBe("1900-01-01");
  });

  it("no construye un Date, así que no corre el día", () => {
    // `new Date("2026-10-09")` es medianoche UTC y en Argentina cae el 8.
    // Esto corta el string y nunca entra en una zona horaria.
    expect(aFechaIso("01/01/2026")).toBe("2026-01-01");
    expect(aFechaIso("31/12/2026")).toBe("2026-12-31");
  });

  it("rechaza lo que no es una fecha, y lo que no existe", () => {
    for (const basura of ["", "2026-10-09", "32/01/2026", "09/13/2026", "00/10/2026", "ayer"]) {
      expect(aFechaIso(basura)).toBeNull();
    }
  });
});

describe("cuitLeido", () => {
  it("acepta con guiones y sin guiones", () => {
    // Farmcity imprime "30-69213874-7"; las otras dos, los once dígitos juntos.
    expect(cuitLeido("30-69213874-7")).toBe("30692138747");
    expect(cuitLeido("20353225430")).toBe("20353225430");
    expect(cuitLeido("30716644495")).toBe("30716644495");
  });

  it("no acepta la etiqueta pegada al número", () => {
    // Al modelo se le pide el valor, no la línea entera. Si devuelve
    // "CUIT: 30716644495", es que leyó mal el campo, y conviene que eso se
    // vea como campo vacío a completar y no que el código lo adivine.
    expect(cuitLeido("CUIT: 30716644495")).toBeNull();
  });

  it("rechaza un CUIT con el dígito verificador mal", () => {
    // El verificador es lo que separa un CUIT mal leído de uno bueno: un
    // dígito cambiado por el OCR cae acá.
    expect(cuitLeido("30-69213874-8")).toBeNull();
    expect(cuitLeido("20353225431")).toBeNull();
  });

  it("rechaza lo que no tiene once dígitos", () => {
    for (const basura of ["", "35322543", "203532254300", "no tiene"]) {
      expect(cuitLeido(basura)).toBeNull();
    }
  });
});

describe("aNumeracion", () => {
  it("lee punto de venta y número por separado", () => {
    // Formato de las facturas de ARCA: dos campos distintos.
    expect(aNumeracion("00002", "00000080")).toEqual({ puntoVenta: 2, numero: 80 });
    expect(aNumeracion("00010", "00000094")).toEqual({ puntoVenta: 10, numero: 94 });
  });

  it("lee el formato pegado con guión", () => {
    // Farmcity imprime un solo campo: "Nro. Comprobante: 02715-00574048".
    expect(aNumeracion("02715-00574048")).toEqual({ puntoVenta: 2715, numero: 574048 });
  });

  it("los ceros a la izquierda no se guardan", () => {
    // La columna es `integer`: el relleno es de impresión, no del dato.
    expect(aNumeracion("00002", "00000080")?.numero).toBe(80);
  });

  it("devuelve null cuando no se entiende", () => {
    expect(aNumeracion("", "")).toBeNull();
    expect(aNumeracion("abc", "def")).toBeNull();
    // Un solo campo que no trae el guión: falta la mitad del dato.
    expect(aNumeracion("00002")).toBeNull();
    expect(aNumeracion("1-2-3")).toBeNull();
  });
});
