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

/**
 * Otro banco imprime un solo importe con signo en vez de dos columnas, y deja
 * en blanco la celda que no corresponde en vez de poner un cero. Las columnas
 * se buscan por nombre, así que estos archivos entran por el mismo lector.
 */
describe("un extracto con una sola columna de importe", () => {
  const COLUMNAS_UNICA: Celda[] = ["Fecha", "Descripcion", "Importe", "Saldo"];

  function conImportes(...importes: [string, string][]): Celda[][] {
    return [
      COLUMNAS_UNICA,
      ...importes.map(([importe, saldo], i): Celda[] => [
        `0${i + 1}/10/2026`,
        "MOVIMIENTO",
        importe,
        saldo,
      ]),
    ];
  }

  it("el signo de la columna es el que decide si entra o sale", () => {
    const r = interpretarExtracto(conImportes(["1.000,00", "11000"], ["-1.000,00", "10000"]));
    expect(r.lineas.map((l) => l.importe.aStringFiscal())).toEqual(["1000.00", "-1000.00"]);
  });

  it("el saldo corrido se verifica igual que con dos columnas", () => {
    const r = interpretarExtracto(conImportes(["1.000,00", "11000"], ["-1.000,00", "10000"]));
    expect(r.saldo.ok).toBe(true);
    expect(r.saldo.ok && r.saldo.saldoInicial.aStringFiscal()).toBe("10000.00");
    expect(r.saldo.ok && r.saldo.saldoFinal.aStringFiscal()).toBe("10000.00");
  });

  it("si el banco imprimiera el débito sin signo, el saldo no cierra y lo dice", () => {
    // Es el motivo por el que el signo no se deduce del saldo: el saldo es el
    // control de que la lectura estuvo bien, y completarlo con él haría que
    // cerrara siempre, incluso leyendo al revés un egreso.
    const r = interpretarExtracto(
      conImportes(["1.000,00", "11000"], ["1.000,00", "10000"], ["1.000,00", "12000"]),
    );
    expect(r.saldo.ok).toBe(false);
  });

  it("un importe ilegible se informa, no se saltea", () => {
    const r = interpretarExtracto(conImportes(["1.000,00", "11000"], ["basura", "10000"]));
    expect(r.filasIlegibles).toEqual([{ fila: 3, motivo: "importe" }]);
  });
});

describe("dos columnas de importe con celdas en blanco", () => {
  const COLUMNAS_BLANCO: Celda[] = ["Fecha", "Movimiento", "Débito", "Crédito", "Saldo"];

  it("la celda que el banco deja en blanco vale cero", () => {
    // Galicia imprime "0,00" en la columna que no corresponde; otro banco la
    // deja vacía, y antes eso hacía ilegible toda la fila.
    const r = interpretarExtracto([
      COLUMNAS_BLANCO,
      ["01/10/2026", "DEPOSITO", null, "1.000,00", "11000"],
      ["05/10/2026", "COMISION", "1.000,00", "", "10000"],
    ]);
    expect(r.lineas.map((l) => l.importe.aStringFiscal())).toEqual(["1000.00", "-1000.00"]);
    expect(r.filasIlegibles).toEqual([]);
  });

  it("las dos en blanco no son un movimiento de cero: es una fila que no se leyó", () => {
    const r = interpretarExtracto([
      COLUMNAS_BLANCO,
      ["01/10/2026", "DEPOSITO", null, "1.000,00", "11000"],
      ["05/10/2026", "RARA", null, null, "11000"],
    ]);
    expect(r.filasIlegibles).toEqual([{ fila: 3, motivo: "importe" }]);
  });
});

describe("sin ninguna columna de importe", () => {
  it("no es un extracto, y el mensaje nombra las dos formas que se aceptan", () => {
    expect(() =>
      interpretarExtracto([
        ["Fecha", "Movimiento", "Saldo"],
        ["01/10/2026", "DEPOSITO", "11000"],
      ]),
    ).toThrow(/Débito y de Crédito, o una sola de Importe/);
  });
});

describe("cuando las fechas no alcanzan para ordenar", () => {
  /** Todo en el mismo día: la fecha no dice qué pasó primero. */
  const UN_SOLO_DIA: Celda[][] = [
    ["Fecha", "Movimiento", "Débito", "Crédito", "Saldo"],
    ["13/10/2026", "SEGUNDO", "0,00", "5.000,00", "15000"],
    ["13/10/2026", "PRIMERO", "0,00", "10.000,00", "10000"],
  ];

  it("el saldo decide el orden", () => {
    const r = interpretarExtracto(UN_SOLO_DIA);
    expect(r.lineas.map((l) => l.descripcion)).toEqual(["PRIMERO", "SEGUNDO"]);
    expect(r.saldo.ok).toBe(true);
  });

  it("con fechas distintas no se da vuelta el extracto para que el saldo cierre", () => {
    // Dar vuelta hasta que cierre convierte una lectura equivocada en una que
    // parece buena. Con dos líneas de días distintos, invertirlas casi siempre
    // cierra: acá el egreso quedó sin signo y se tiene que ver.
    const r = interpretarExtracto([
      ["Fecha", "Descripcion", "Importe", "Saldo"],
      ["01/10/2026", "DEPOSITO", "1.000,00", "11000"],
      ["05/10/2026", "COMISION", "1.000,00", "10000"],
    ]);
    expect(r.lineas.map((l) => l.descripcion)).toEqual(["DEPOSITO", "COMISION"]);
    expect(r.saldo.ok).toBe(false);
  });
});
