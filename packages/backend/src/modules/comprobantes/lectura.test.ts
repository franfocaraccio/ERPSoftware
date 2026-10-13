import { describe, expect, it } from "vitest";
import {
  aAlicuota,
  aFechaIso,
  aImporte,
  aNumeracion,
  type ComprobanteLeido,
  cuitLeido,
  interpretar,
  interpretarVenta,
} from "./lectura.js";

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

describe("interpretar", () => {
  /** Lo que devolvería el modelo: todo string, "" cuando el papel no lo trae. */
  function leido(parcial: Partial<ComprobanteLeido> = {}): ComprobanteLeido {
    return {
      emisorRazonSocial: "AXCER S.R.L.",
      emisorCuit: "30716644495",
      receptorRazonSocial: "Cliente SA",
      receptorCuit: "30692138747",
      cae: "",
      caeVencimiento: "",
      items: [],
      letra: "A",
      puntoVenta: "00002",
      numero: "00000080",
      numeroCompleto: "",
      fechaEmision: "09/10/2026",
      concepto: "Servicios",
      neto: "10000,00",
      iva: "2100,00",
      otrosTributos: "0,00",
      total: "12100,00",
      ...parcial,
    };
  }

  it("arma el número como se escribe en Argentina", () => {
    expect(interpretar(leido()).numeroCompleto).toBe("0002-00000080");
  });

  it("entiende el número pegado de un ticket", () => {
    // Farmcity: un solo campo, "02715-00574048".
    const p = interpretar(leido({ puntoVenta: "", numero: "", numeroCompleto: "02715-00574048" }));
    expect(p.numeroCompleto).toBe("2715-00574048");
    expect(p.reparos).toEqual([]);
  });

  it("una factura C sin línea de IVA no tiene reparos", () => {
    // Focaraccio, monotributo: 3.500.000 y ni una línea de IVA. El IVA vacío
    // acá es lo normal, no un campo que no se pudo leer.
    const p = interpretar(leido({ letra: "C", neto: "3500000,00", iva: "", total: "3500000,00" }));
    expect(p.iva).toBe("0.00");
    expect(p.reparos).toEqual([]);
  });

  it("una factura A sin IVA sí es un campo que falta", () => {
    // La A siempre discrimina: si no se leyó, se leyó mal.
    const p = interpretar(leido({ iva: "", total: "10000,00" }));
    expect(p.iva).toBeNull();
    expect(p.reparos).toContainEqual({ campo: "iva", motivo: "ilegible" });
  });

  it("marca el total que no cierra y dice cuál esperaba", () => {
    const p = interpretar(leido({ total: "12000,00" }));
    expect(p.reparos).toContainEqual({
      campo: "total",
      motivo: "no_cierra",
      esperado: "12100.00",
    });
    // Y no lo corrige: el campo queda con lo que decía el papel.
    expect(p.total).toBe("12000.00");
  });

  it("marca el IVA contenido de una B cargado como si sumara", () => {
    // El error caro: los 1382,01 de Farmcity ya están adentro de los 7963.
    const p = interpretar(leido({ letra: "B", neto: "7963,00", iva: "1382,01", total: "7963,00" }));
    expect(p.reparos).toContainEqual({ campo: "iva", motivo: "sin_discriminar" });
  });

  it("deja en null lo que no entendió, nunca un valor inventado", () => {
    const p = interpretar(
      leido({ emisorCuit: "", letra: "", puntoVenta: "", numero: "", fechaEmision: "", total: "" }),
    );
    expect(p).toMatchObject({
      emisorCuit: null,
      letra: null,
      numeroCompleto: null,
      fechaEmision: null,
      total: null,
    });
    expect(p.reparos.map((r) => r.campo).sort()).toEqual([
      "emisorCuit",
      "fechaEmision",
      "letra",
      "numeroCompleto",
      "total",
    ]);
  });

  it("un CUIT con el verificador mal queda como ilegible", () => {
    const p = interpretar(leido({ emisorCuit: "30716644494" }));
    expect(p.emisorCuit).toBeNull();
    expect(p.reparos).toContainEqual({ campo: "emisorCuit", motivo: "ilegible" });
  });

  it("no inventa reparos cuando todo cierra", () => {
    expect(interpretar(leido()).reparos).toEqual([]);
  });
});

describe("aAlicuota", () => {
  it("acepta las formas en que se imprime", () => {
    expect(aAlicuota("21")).toBe("21");
    expect(aAlicuota("21 %")).toBe("21");
    expect(aAlicuota("21,00")).toBe("21");
    expect(aAlicuota("10,5%")).toBe("10.5");
    expect(aAlicuota("Exento")).toBe("exento");
    expect(aAlicuota("No gravado")).toBe("no_gravado");
  });

  it("rechaza una alícuota que no existe", () => {
    // No es un porcentaje libre: ARCA acepta ocho. Un 15% leído mal tiene que
    // quedar como campo a completar, no entrar al comprobante.
    for (const basura of ["", "15", "21.5", "cualquiera"]) {
      expect(aAlicuota(basura)).toBeNull();
    }
  });
});

describe("interpretarVenta", () => {
  function venta(parcial: Partial<ComprobanteLeido> = {}): ComprobanteLeido {
    return {
      emisorRazonSocial: "Mi Empresa SA",
      emisorCuit: "30716644495",
      receptorRazonSocial: "Farmcity S.A",
      receptorCuit: "30-69213874-7",
      letra: "A",
      puntoVenta: "00003",
      numero: "00001234",
      numeroCompleto: "",
      fechaEmision: "13/10/2026",
      concepto: "Servicios",
      neto: "10000,00",
      iva: "2100,00",
      otrosTributos: "0,00",
      total: "12100,00",
      cae: "70417054367476",
      caeVencimiento: "23/10/2026",
      items: [
        {
          descripcion: "Un producto",
          cantidad: "1,00",
          precioUnitario: "10000,00",
          alicuotaIva: "21",
        },
      ],
      ...parcial,
    };
  }

  it("arma la propuesta con el cliente, el número y el CAE", () => {
    const p = interpretarVenta(venta());
    expect(p).toMatchObject({
      receptorCuit: "30692138747",
      clase: "factura",
      letraLeida: "A",
      puntoVenta: 3,
      numero: 1234,
      fechaEmision: "2026-10-13",
      cae: "70417054367476",
      caeVencimiento: "2026-10-23",
    });
    expect(p.reparos).toEqual([]);
  });

  it("lee los ítems con su alícuota", () => {
    const p = interpretarVenta(venta());
    expect(p.items).toEqual([
      {
        descripcion: "Un producto",
        cantidad: "1.00",
        precioUnitario: "10000.00",
        alicuotaIva: "21",
      },
    ]);
  });

  it("avisa cuando los ítems no dan el total impreso", () => {
    // Es la validación que cubre toda la lectura de una sola vez: si una
    // cantidad o un precio se leyó mal, la cuenta no cierra contra el papel.
    const p = interpretarVenta(
      venta({
        items: [
          {
            descripcion: "Un producto",
            cantidad: "2,00",
            precioUnitario: "10000,00",
            alicuotaIva: "21",
          },
        ],
      }),
    );
    expect(p.reparos).toContainEqual({
      campo: "total",
      motivo: "no_cierra",
      esperado: "24200.00",
    });
  });

  it("una venta sin ítems no se puede cargar", () => {
    // El comprobante de venta se arma de los ítems: sin ellos no hay nada que
    // guardar, por más que el total esté impreso.
    expect(interpretarVenta(venta({ items: [] })).reparos).toContainEqual({
      campo: "items",
      motivo: "ilegible",
    });
  });

  it("marca el ítem incompleto, diciendo cuál", () => {
    const p = interpretarVenta(
      venta({
        items: [
          { descripcion: "Bueno", cantidad: "1", precioUnitario: "100", alicuotaIva: "21" },
          { descripcion: "", cantidad: "1", precioUnitario: "100", alicuotaIva: "21" },
        ],
      }),
    );
    expect(p.reparos).toContainEqual({ campo: "items.1", motivo: "ilegible" });
    expect(p.reparos).not.toContainEqual({ campo: "items.0", motivo: "ilegible" });
  });

  it("reconoce una nota de crédito", () => {
    expect(interpretarVenta(venta({ concepto: "NOTA DE CRÉDITO A" })).clase).toBe("nota_credito");
    expect(interpretarVenta(venta({ concepto: "Nota de debito" })).clase).toBe("nota_debito");
  });

  it("sin CAE no inventa uno", () => {
    // Una factura vieja cargada a mano puede no tenerlo, y es válido.
    const p = interpretarVenta(venta({ cae: "", caeVencimiento: "" }));
    expect(p.cae).toBeNull();
    expect(p.caeVencimiento).toBeNull();
  });

  it("el total impreso no se guarda, sólo se contrasta", () => {
    // Queda a la vista para la persona, pero lo que se persiste sale de los
    // ítems, calculado con la misma función que usa el backend al guardar.
    expect(interpretarVenta(venta()).totalImpreso).toBe("12100.00");
  });
});
