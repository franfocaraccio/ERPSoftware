import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { imputarFIFO } from "./imputacion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

const deuda = (id: string, vencimiento: string, importe: string) => ({
  id,
  vencimiento,
  importe: ars(importe),
});

function pendientes(resultado: ReturnType<typeof imputarFIFO>) {
  return resultado.pendientes.map((p) => [p.id, p.pendiente.aStringFiscal()]);
}

describe("imputarFIFO", () => {
  it("sin crédito, todo queda pendiente", () => {
    const r = imputarFIFO([deuda("a", "2026-01-10", "100")], Money.cero("ARS"));
    expect(pendientes(r)).toEqual([["a", "100.00"]]);
    expect(r.aCuenta.esCero()).toBe(true);
  });

  it("cancela primero lo que vence antes, sin importar el orden de entrada", () => {
    const r = imputarFIFO(
      [deuda("nueva", "2026-03-01", "100"), deuda("vieja", "2026-01-01", "100")],
      ars("150"),
    );
    expect(pendientes(r)).toEqual([["nueva", "50.00"]]);
  });

  it("un comprobante cancelado del todo no aparece como pendiente", () => {
    const r = imputarFIFO([deuda("a", "2026-01-01", "100")], ars("100"));
    expect(r.pendientes).toEqual([]);
    expect(r.aCuenta.esCero()).toBe(true);
  });

  it("lo que sobra queda a cuenta, no se pierde", () => {
    const r = imputarFIFO([deuda("a", "2026-01-01", "100")], ars("130.50"));
    expect(r.pendientes).toEqual([]);
    expect(r.aCuenta.aStringFiscal()).toBe("30.50");
  });

  it("a igual vencimiento, desempata por id para que el resultado sea estable", () => {
    const r = imputarFIFO(
      [deuda("b", "2026-01-01", "100"), deuda("a", "2026-01-01", "100")],
      ars("100"),
    );
    expect(pendientes(r)).toEqual([["b", "100.00"]]);
  });

  it("conserva el vencimiento de cada pendiente", () => {
    const r = imputarFIFO([deuda("a", "2026-01-01", "100")], ars("40"));
    expect(r.pendientes[0]?.vencimiento).toBe("2026-01-01");
  });

  it("rechaza deudas negativas: una nota de crédito se pasa como crédito", () => {
    expect(() => imputarFIFO([deuda("nc", "2026-01-01", "-10")], Money.cero("ARS"))).toThrow();
  });

  it("rechaza un crédito negativo", () => {
    expect(() => imputarFIFO([deuda("a", "2026-01-01", "10")], ars("-1"))).toThrow();
  });
});
