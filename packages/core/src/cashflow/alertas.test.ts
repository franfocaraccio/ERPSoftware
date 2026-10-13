import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { alertasAnticipadas } from "./alertas.js";

const ars = (v: string) => Money.desdeString(v, "ARS");
const semana = (n: number, saldo: string) => ({
  semana: n,
  inicio: `2026-08-${String(n * 7).padStart(2, "0")}`,
  saldoFinal: ars(saldo),
});

describe("alertasAnticipadas", () => {
  it("avisa la primera semana en que el saldo cae bajo el mínimo", () => {
    const r = alertasAnticipadas([semana(1, "500"), semana(2, "90"), semana(3, "50")], ars("100"));
    expect(r.primeraBajoMinimo?.semana).toBe(2);
  });

  it("avisa aparte la primera semana en negativo", () => {
    const r = alertasAnticipadas([semana(1, "50"), semana(2, "-10")], ars("100"));
    expect(r.primeraBajoMinimo?.semana).toBe(1);
    expect(r.primeraNegativa?.semana).toBe(2);
  });

  it("sin mínimo definido, sólo mira el negativo", () => {
    const r = alertasAnticipadas([semana(1, "5"), semana(2, "-1")], null);
    expect(r.primeraBajoMinimo).toBeNull();
    expect(r.primeraNegativa?.semana).toBe(2);
  });

  it("todo en orden: sin alertas", () => {
    const r = alertasAnticipadas([semana(1, "500")], ars("100"));
    expect(r).toEqual({ primeraBajoMinimo: null, primeraNegativa: null });
  });
});
