import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { antiguedadDeuda, enMora, estadoCobro, saldosPorComprobante } from "./cuenta-corriente.js";

const ars = (v: string) => Money.desdeString(v, "ARS");
const cero = Money.cero("ARS");

const comp = (id: string, vencimiento: string, total: string) => ({
  id,
  vencimiento,
  total: ars(total),
});

function porId(r: ReturnType<typeof saldosPorComprobante>) {
  return Object.fromEntries(r.comprobantes.map((c) => [c.id, c.pendiente.aStringFiscal()]));
}

describe("saldosPorComprobante", () => {
  it("sin imputaciones ni crédito, todo queda pendiente", () => {
    const r = saldosPorComprobante([comp("a", "2026-01-01", "100")], new Map(), cero);
    expect(porId(r)).toEqual({ a: "100.00" });
  });

  it("lo imputado explícitamente cancela ese comprobante y no otro", () => {
    // La imputación manda sobre FIFO: el cliente dijo qué pagaba.
    const r = saldosPorComprobante(
      [comp("vieja", "2026-01-01", "100"), comp("nueva", "2026-03-01", "100")],
      new Map([["nueva", ars("100")]]),
      cero,
    );
    expect(porId(r)).toEqual({ vieja: "100.00", nueva: "0.00" });
  });

  it("el crédito sin imputar (a cuenta) se aplica después, FIFO", () => {
    const r = saldosPorComprobante(
      [comp("vieja", "2026-01-01", "100"), comp("nueva", "2026-03-01", "100")],
      new Map([["nueva", ars("40")]]),
      ars("130"),
    );
    // vieja: 100 − 100 (FIFO) = 0; nueva: 100 − 40 − 30 = 30.
    expect(porId(r)).toEqual({ vieja: "0.00", nueva: "30.00" });
    expect(r.aCuenta.esCero()).toBe(true);
  });

  it("lo que sobra del crédito queda a cuenta", () => {
    const r = saldosPorComprobante([comp("a", "2026-01-01", "100")], new Map(), ars("150"));
    expect(r.aCuenta.aStringFiscal()).toBe("50.00");
  });

  it("devuelve todos los comprobantes, también los cancelados, con lo cobrado", () => {
    const r = saldosPorComprobante(
      [comp("a", "2026-01-01", "100")],
      new Map([["a", ars("100")]]),
      cero,
    );
    expect(r.comprobantes[0]?.cancelado.aStringFiscal()).toBe("100.00");
  });

  it("rechaza imputar más que el total de un comprobante", () => {
    expect(() =>
      saldosPorComprobante([comp("a", "2026-01-01", "100")], new Map([["a", ars("101")]]), cero),
    ).toThrow();
  });
});

describe("estadoCobro", () => {
  const hoy = "2026-05-10";
  it("cobrada cuando no queda nada", () => {
    expect(estadoCobro(ars("100"), cero, "2026-01-01", hoy)).toBe("cobrada");
  });
  it("vencida cuando queda algo y la fecha pasó, aunque sea parcial", () => {
    expect(estadoCobro(ars("100"), ars("30"), "2026-05-09", hoy)).toBe("vencida");
  });
  it("hoy todavía no está vencida", () => {
    expect(estadoCobro(ars("100"), ars("100"), hoy, hoy)).toBe("pendiente");
  });
  it("parcial cuando se cobró una parte y no venció", () => {
    expect(estadoCobro(ars("100"), ars("30"), "2026-06-01", hoy)).toBe("parcial");
  });
  it("pendiente cuando no se cobró nada y no venció", () => {
    expect(estadoCobro(ars("100"), ars("100"), "2026-06-01", hoy)).toBe("pendiente");
  });
});

describe("antiguedadDeuda", () => {
  const hoy = "2026-05-10";
  it("reparte lo pendiente por días de atraso", () => {
    const r = antiguedadDeuda(
      [
        { vencimiento: "2026-05-20", pendiente: ars("1") }, // a vencer
        { vencimiento: "2026-05-10", pendiente: ars("2") }, // vence hoy: a vencer
        { vencimiento: "2026-05-09", pendiente: ars("4") }, // 1 día
        { vencimiento: "2026-04-10", pendiente: ars("8") }, // 30 días
        { vencimiento: "2026-04-09", pendiente: ars("16") }, // 31 días
        { vencimiento: "2026-02-09", pendiente: ars("32") }, // 90 días
        { vencimiento: "2026-02-08", pendiente: ars("64") }, // 91 días
      ],
      hoy,
    );
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.aStringFiscal()]))).toEqual({
      aVencer: "3.00",
      hasta30: "12.00",
      de31a60: "16.00",
      de61a90: "32.00",
      masDe90: "64.00",
    });
  });
});

describe("enMora", () => {
  const hoy = "2026-05-10";
  it("en mora si algo lleva vencido más días que el umbral", () => {
    expect(enMora([{ vencimiento: "2026-03-01", pendiente: ars("1") }], hoy, 60)).toBe(true);
  });
  it("no está en mora justo en el umbral", () => {
    // 2026-03-11 → 60 días de atraso exactos.
    expect(enMora([{ vencimiento: "2026-03-11", pendiente: ars("1") }], hoy, 60)).toBe(false);
  });
  it("lo ya cancelado no cuenta", () => {
    expect(enMora([{ vencimiento: "2026-01-01", pendiente: cero }], hoy, 60)).toBe(false);
  });
});
