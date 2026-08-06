import { describe, expect, it } from "vitest";
import { ImporteInvalidoError, MonedaDistintaError, Money } from "./money.js";

describe("Money.desdeString", () => {
  it("crea un importe desde un string decimal", () => {
    const m = Money.desdeString("1234.56", "ARS");
    expect(m.aString()).toBe("1234.56");
    expect(m.moneda).toBe("ARS");
  });

  it("acepta negativos y cero", () => {
    expect(Money.desdeString("-10.5", "ARS").aString()).toBe("-10.5");
    expect(Money.desdeString("0", "USD").esCero()).toBe(true);
  });

  it("conserva la precisión de entrada sin redondear", () => {
    expect(Money.desdeString("1234.5678", "ARS").aString()).toBe("1234.5678");
  });

  it("rechaza strings que no son números", () => {
    expect(() => Money.desdeString("", "ARS")).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeString("abc", "ARS")).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeString("1,5", "ARS")).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeString("NaN", "ARS")).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeString("Infinity", "ARS")).toThrow(ImporteInvalidoError);
  });
});

describe("Money.cero", () => {
  it("crea el importe cero de una moneda", () => {
    const cero = Money.cero("USD");
    expect(cero.esCero()).toBe(true);
    expect(cero.moneda).toBe("USD");
  });
});

describe("aritmética", () => {
  it("suma sin errores de punto flotante", () => {
    const a = Money.desdeString("0.1", "ARS");
    const b = Money.desdeString("0.2", "ARS");
    expect(a.sumar(b).aString()).toBe("0.3");
  });

  it("resta y puede quedar negativo", () => {
    const a = Money.desdeString("100", "ARS");
    const b = Money.desdeString("150.25", "ARS");
    const r = a.restar(b);
    expect(r.aString()).toBe("-50.25");
    expect(r.esNegativo()).toBe(true);
  });

  it("multiplica por un factor string (ej: cantidad)", () => {
    const precio = Money.desdeString("10.50", "ARS");
    expect(precio.multiplicarPor("3").aString()).toBe("31.5");
    expect(precio.multiplicarPor("0.5").aString()).toBe("5.25");
  });

  it("calcula un porcentaje sin redondear (ej: alícuota de IVA)", () => {
    const neto = Money.desdeString("100.10", "ARS");
    expect(neto.porcentaje("21").aString()).toBe("21.021");
  });

  it("niega el importe (para notas de crédito)", () => {
    expect(Money.desdeString("99.99", "ARS").negar().aString()).toBe("-99.99");
  });

  it("rechaza operar entre monedas distintas", () => {
    const ars = Money.desdeString("10", "ARS");
    const usd = Money.desdeString("10", "USD");
    expect(() => ars.sumar(usd)).toThrow(MonedaDistintaError);
    expect(() => ars.restar(usd)).toThrow(MonedaDistintaError);
  });

  it("es inmutable: las operaciones devuelven instancias nuevas", () => {
    const a = Money.desdeString("1", "ARS");
    const b = a.sumar(Money.desdeString("2", "ARS"));
    expect(a.aString()).toBe("1");
    expect(b.aString()).toBe("3");
  });
});

describe("redondeo fiscal (2 decimales, mitad hacia arriba)", () => {
  it("redondea a 2 decimales", () => {
    expect(Money.desdeString("21.021", "ARS").redondeoFiscal().aString()).toBe("21.02");
    expect(Money.desdeString("21.026", "ARS").redondeoFiscal().aString()).toBe("21.03");
  });

  it("el .5 exacto redondea hacia arriba (half-up)", () => {
    expect(Money.desdeString("21.025", "ARS").redondeoFiscal().aString()).toBe("21.03");
    expect(Money.desdeString("0.005", "ARS").redondeoFiscal().aString()).toBe("0.01");
  });

  it("en negativos el .5 exacto se aleja de cero", () => {
    expect(Money.desdeString("-21.025", "ARS").redondeoFiscal().aString()).toBe("-21.03");
  });

  it("no altera valores que ya tienen 2 decimales", () => {
    expect(Money.desdeString("100.10", "ARS").redondeoFiscal().aString()).toBe("100.1");
  });
});

describe("serialización para el borde tRPC", () => {
  it("aStringFiscal devuelve siempre 2 decimales", () => {
    expect(Money.desdeString("0.3", "ARS").aStringFiscal()).toBe("0.30");
    expect(Money.desdeString("1234", "ARS").aStringFiscal()).toBe("1234.00");
    expect(Money.desdeString("21.025", "ARS").aStringFiscal()).toBe("21.03");
  });
});

describe("comparaciones", () => {
  it("igualA compara por valor numérico, no por representación", () => {
    expect(Money.desdeString("1.50", "ARS").igualA(Money.desdeString("1.5", "ARS"))).toBe(true);
    expect(Money.desdeString("1.50", "ARS").igualA(Money.desdeString("1.51", "ARS"))).toBe(false);
  });

  it("igualA entre monedas distintas es false, no error", () => {
    expect(Money.desdeString("1", "ARS").igualA(Money.desdeString("1", "USD"))).toBe(false);
  });

  it("mayorQue y menorQue exigen la misma moneda", () => {
    const a = Money.desdeString("2", "ARS");
    const b = Money.desdeString("1", "ARS");
    expect(a.mayorQue(b)).toBe(true);
    expect(b.menorQue(a)).toBe(true);
    expect(() => a.mayorQue(Money.desdeString("1", "USD"))).toThrow(MonedaDistintaError);
  });

  it("esPositivo / esNegativo / esCero", () => {
    expect(Money.desdeString("0.01", "ARS").esPositivo()).toBe(true);
    expect(Money.desdeString("-0.01", "ARS").esNegativo()).toBe(true);
    expect(Money.desdeString("0.00", "ARS").esCero()).toBe(true);
  });
});

describe("Money.sumarTodos", () => {
  it("suma una lista de importes de la misma moneda", () => {
    const total = Money.sumarTodos(
      [
        Money.desdeString("10.10", "ARS"),
        Money.desdeString("20.20", "ARS"),
        Money.desdeString("0.03", "ARS"),
      ],
      "ARS",
    );
    expect(total.aString()).toBe("30.33");
  });

  it("la lista vacía devuelve cero en la moneda pedida", () => {
    const total = Money.sumarTodos([], "USD");
    expect(total.esCero()).toBe(true);
    expect(total.moneda).toBe("USD");
  });

  it("rechaza listas con monedas mezcladas", () => {
    expect(() =>
      Money.sumarTodos([Money.desdeString("1", "ARS"), Money.desdeString("1", "USD")], "ARS"),
    ).toThrow(MonedaDistintaError);
  });
});
