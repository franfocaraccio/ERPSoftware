import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { estadoStock, margenBruto, valorizacion } from "./stock.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("estadoStock", () => {
  it("marca Reponer cuando el stock llegó al mínimo", () => {
    expect(estadoStock("10", "10")).toBe("reponer");
  });

  it("marca Reponer cuando está por debajo del mínimo", () => {
    expect(estadoStock("3.5", "10")).toBe("reponer");
  });

  it("marca OK cuando está por encima del mínimo", () => {
    expect(estadoStock("10.001", "10")).toBe("ok");
  });

  it("con mínimo cero, cualquier stock positivo está OK", () => {
    expect(estadoStock("1", "0")).toBe("ok");
  });

  it("stock cero con mínimo cero es Reponer (no queda nada)", () => {
    expect(estadoStock("0", "0")).toBe("reponer");
  });

  it("stock negativo siempre es Reponer", () => {
    expect(estadoStock("-2", "0")).toBe("reponer");
  });
});

describe("valorizacion", () => {
  it("multiplica stock por costo unitario", () => {
    expect(valorizacion("12", ars("1500.50")).aStringFiscal()).toBe("18006.00");
  });

  it("soporta cantidades con decimales", () => {
    expect(valorizacion("2.5", ars("100")).aStringFiscal()).toBe("250.00");
  });

  it("redondea el resultado a 2 decimales", () => {
    // 3 × 10.005 = 30.015 → 30.02
    expect(valorizacion("3", ars("10.005")).aStringFiscal()).toBe("30.02");
  });

  it("sin costo cargado la valorización es cero", () => {
    expect(valorizacion("100", null).esCero()).toBe(true);
  });

  it("stock cero vale cero", () => {
    expect(valorizacion("0", ars("999.99")).esCero()).toBe(true);
  });
});

describe("margenBruto", () => {
  it("calcula el margen como (precio - costo) / precio", () => {
    // (1000 - 600) / 1000 = 40%
    expect(margenBruto(ars("1000"), ars("600"))).toBe("40.00");
  });

  it("devuelve null si falta el precio o el costo", () => {
    expect(margenBruto(null, ars("600"))).toBeNull();
    expect(margenBruto(ars("1000"), null)).toBeNull();
  });

  it("devuelve null con precio cero (no se puede dividir)", () => {
    expect(margenBruto(ars("0"), ars("600"))).toBeNull();
  });

  it("un costo mayor al precio da margen negativo", () => {
    expect(margenBruto(ars("100"), ars("150"))).toBe("-50.00");
  });
});
