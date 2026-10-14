import { describe, expect, it } from "vitest";
import { interpretarExtracto } from "./extracto.js";
import type { Celda } from "./xlsx.js";

/**
 * Filas con la forma del extracto de Galicia: un bloque de datos de la cuenta
 * arriba, el encabezado en la sexta fila y los movimientos del más nuevo al
 * más viejo. Los importes y los nombres son inventados.
 */
const ENCABEZADO_BANCO: Celda[][] = [
  ["Banco Galicia - Cuenta Corriente Pesos"],
  ["Nro. de Cuenta: ...1234567"],
  ["Fecha Actual: 13/10/2026"],
  ["Hora Actual: 12:02"],
  ["Intervalo de Consulta: del 01/10/2026 al 13/10/2026"],
];
const COLUMNAS: Celda[] = [
  "Fecha",
  "Movimiento",
  "Débito",
  "Crédito",
  "Saldo Parcial",
  "Comentarios",
];

/** Del más nuevo al más viejo, como los imprime Galicia. Saldo inicial: 10.000. */
const MOVIMIENTOS: Celda[][] = [
  [
    "13/10/2026",
    " TRANSFERENCIA A TERCEROS\n Proveedor SA\n 30716644495\n",
    "-3.600,00",
    "0,00",
    "21400",
    null,
  ],
  [
    "09/10/2026",
    " CREDITO TRANSFERENCIA\n Cliente SRL\n 30692138747\n",
    "0,00",
    "15.000,00",
    "25000",
    null,
  ],
  ["05/10/2026", " COMISION MANTENIMIENTO CTA\n", "-1.000,00", "0,00", "10000", null],
  ["01/10/2026", " DEP.EFVO.AUTOSERVICIO\n", "0,00", "1.000,00", "11000", null],
];

function extracto(movimientos: Celda[][] = MOVIMIENTOS): Celda[][] {
  return [...ENCABEZADO_BANCO, COLUMNAS, ...movimientos];
}

describe("interpretarExtracto", () => {
  it("las pone en orden cronológico, de la más vieja a la más nueva", () => {
    // Galicia las imprime al revés. El saldo corrido sólo encadena en orden
    // cronológico, así que esto no es cosmético.
    const r = interpretarExtracto(extracto());
    expect(r.lineas.map((l) => l.fecha)).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-09",
      "2026-10-13",
    ]);
  });

  it("el débito resta y el crédito suma", () => {
    const r = interpretarExtracto(extracto());
    expect(r.lineas.map((l) => l.importe.aStringFiscal())).toEqual([
      "1000.00",
      "-1000.00",
      "15000.00",
      "-3600.00",
    ]);
  });

  it("lee el saldo, que viene sin punto de miles", () => {
    expect(interpretarExtracto(extracto()).lineas.at(-1)?.saldo.aStringFiscal()).toBe("21400.00");
  });

  it("deja la descripción en una línea, sin los espacios del banco", () => {
    expect(interpretarExtracto(extracto()).lineas.at(-1)?.descripcion).toBe(
      "TRANSFERENCIA A TERCEROS · Proveedor SA · 30716644495",
    );
  });

  it("verifica el saldo corrido y devuelve apertura y cierre", () => {
    const r = interpretarExtracto(extracto());
    expect(r.saldo.ok).toBe(true);
    expect(r.saldo.ok && r.saldo.saldoInicial.aStringFiscal()).toBe("10000.00");
    expect(r.saldo.ok && r.saldo.saldoFinal.aStringFiscal()).toBe("21400.00");
  });

  it("si una línea se leyó mal, dice cuál", () => {
    // El crédito de 15.000 leído como 1.500: la cadena se corta justo ahí.
    const mal = MOVIMIENTOS.map((f) => [...f]);
    const fila = mal[1];
    if (fila) {
      fila[3] = "1.500,00";
    }
    const r = interpretarExtracto(extracto(mal));
    expect(r.saldo.ok).toBe(false);
    expect(!r.saldo.ok && r.lineas[r.saldo.indice]?.fecha).toBe("2026-10-09");
  });

  it("con la cadena rota, el orden lo dan las fechas", () => {
    // Cuando el saldo cierra, él mismo sabe el orden. Cuando no cierra no
    // puede decidir, y ahí es donde importa ordenar por fecha: si no, la
    // pantalla mostraría el extracto al revés justo cuando hay que revisarlo.
    const mal = MOVIMIENTOS.map((f) => [...f]);
    const fila = mal[1];
    if (fila) {
      fila[3] = "1.500,00";
    }
    expect(interpretarExtracto(extracto(mal)).lineas.map((l) => l.fecha)).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-09",
      "2026-10-13",
    ]);
  });

  it("encuentra las columnas por su nombre, no por su posición", () => {
    // Si el banco agrega o mueve una columna, el extracto se sigue leyendo.
    const otroOrden: Celda[] = ["Saldo Parcial", "Fecha", "Crédito", "Débito", "Movimiento"];
    const filas: Celda[][] = [otroOrden, ["11000", "01/10/2026", "1.000,00", "0,00", "DEPOSITO"]];
    const [linea] = interpretarExtracto(filas).lineas;
    expect(linea?.importe.aStringFiscal()).toBe("1000.00");
    expect(linea?.saldo.aStringFiscal()).toBe("11000.00");
  });

  it("guarda el bloque de datos de la cuenta, para mostrar qué archivo es", () => {
    // Sirve para que la persona vea si subió el extracto de la cuenta que
    // eligió. El sistema no tiene el número de cuenta para comparar solo.
    expect(interpretarExtracto(extracto()).cuenta).toEqual([
      "Banco Galicia - Cuenta Corriente Pesos",
      "Nro. de Cuenta: ...1234567",
      "Fecha Actual: 13/10/2026",
      "Hora Actual: 12:02",
      "Intervalo de Consulta: del 01/10/2026 al 13/10/2026",
    ]);
  });

  it("sin encabezado reconocible, no es un extracto", () => {
    expect(() => interpretarExtracto([["hola"], ["chau"]])).toThrow();
  });

  it("una fila con fecha pero con el importe ilegible se informa, no se saltea", () => {
    // Saltearla rompería el saldo corrido sin decir por qué. Mejor que la
    // persona sepa qué fila del archivo es.
    const conRota = [...MOVIMIENTOS, ["30/09/2026", "RARA", "basura", "0,00", "10000", null]];
    const r = interpretarExtracto(extracto(conRota));
    expect(r.filasIlegibles).toEqual([{ fila: 11, motivo: "importe" }]);
  });

  it("las filas vacías del final no cuentan", () => {
    const r = interpretarExtracto(extracto([...MOVIMIENTOS, [null, null], []]));
    expect(r.lineas).toHaveLength(4);
    expect(r.filasIlegibles).toEqual([]);
  });
});
