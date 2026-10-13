import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { costoPromedioPonderado } from "./costo.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("costoPromedioPonderado", () => {
  it("pondera el costo que había con el de la compra nueva", () => {
    // 10 unidades a 100 y entran 30 a 140: (1000 + 4200) / 40 = 130.
    expect(costoPromedioPonderado("10", ars("100"), "30", ars("140")).aStringFiscal()).toBe(
      "130.00",
    );
  });

  it("sin stock previo, el costo es el de la compra", () => {
    expect(costoPromedioPonderado("0", ars("100"), "5", ars("80")).aStringFiscal()).toBe("80.00");
  });

  it("con stock negativo (se vendió sin haber), el costo es el de la compra", () => {
    // Un stock negativo no tiene un costo con el que ponderar.
    expect(costoPromedioPonderado("-3", ars("100"), "5", ars("80")).aStringFiscal()).toBe("80.00");
  });

  it("sin costo previo, el costo es el de la compra", () => {
    expect(costoPromedioPonderado("10", null, "5", ars("80")).aStringFiscal()).toBe("80.00");
  });

  it("redondea al centavo", () => {
    // (1×100 + 2×101) / 3 = 100,666…
    expect(costoPromedioPonderado("1", ars("100"), "2", ars("101")).aStringFiscal()).toBe("100.67");
  });

  it("rechaza una compra de cantidad no positiva", () => {
    expect(() => costoPromedioPonderado("10", ars("100"), "0", ars("80"))).toThrow();
  });
});
