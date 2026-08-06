import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { saldoCuentaCorriente } from "./saldos.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("saldoCuentaCorriente", () => {
  it("resta lo cobrado a lo facturado", () => {
    const saldo = saldoCuentaCorriente(ars("15000.50"), ars("5000.25"));
    expect(saldo.aStringFiscal()).toBe("10000.25");
  });

  it("un saldo positivo significa deuda pendiente", () => {
    expect(saldoCuentaCorriente(ars("1000"), ars("400")).esPositivo()).toBe(true);
  });

  it("queda en cero cuando está todo cobrado", () => {
    expect(saldoCuentaCorriente(ars("1000"), ars("1000")).esCero()).toBe(true);
  });

  it("un pago en exceso deja saldo negativo (saldo a favor)", () => {
    const saldo = saldoCuentaCorriente(ars("1000"), ars("1200.75"));
    expect(saldo.esNegativo()).toBe(true);
    expect(saldo.aStringFiscal()).toBe("-200.75");
  });

  it("sin comprobantes ni pagos el saldo es cero", () => {
    expect(saldoCuentaCorriente(Money.cero("ARS"), Money.cero("ARS")).esCero()).toBe(true);
  });
});
