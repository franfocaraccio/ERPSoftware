import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { determinadoImpuesto, posicionMensual } from "./posicion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");
const mes = (periodo: string, cargo: string, credito: string) => ({
  periodo,
  cargo: ars(cargo),
  credito: ars(credito),
});

function resumen(r: ReturnType<typeof posicionMensual>) {
  return r.map((p) => [
    p.periodo,
    p.saldoAFavorAnterior.aStringFiscal(),
    p.aPagar.aStringFiscal(),
    p.saldoAFavorSiguiente.aStringFiscal(),
  ]);
}

describe("posicionMensual", () => {
  it("a pagar es el cargo menos el crédito del mes", () => {
    // IVA: débito 210 de ventas, crédito 84 de compras.
    expect(resumen(posicionMensual([mes("2026-08", "210", "84")]))).toEqual([
      ["2026-08", "0.00", "126.00", "0.00"],
    ]);
  });

  it("el saldo a favor de un mes pasa al siguiente", () => {
    expect(
      resumen(posicionMensual([mes("2026-08", "100", "150"), mes("2026-09", "200", "0")])),
    ).toEqual([
      ["2026-08", "0.00", "0.00", "50.00"],
      ["2026-09", "50.00", "150.00", "0.00"],
    ]);
  });

  it("el saldo a favor se sigue arrastrando mientras no se consuma", () => {
    expect(
      resumen(
        posicionMensual([
          mes("2026-07", "0", "300"),
          mes("2026-08", "100", "0"),
          mes("2026-09", "100", "0"),
        ]),
      ),
    ).toEqual([
      ["2026-07", "0.00", "0.00", "300.00"],
      ["2026-08", "300.00", "0.00", "200.00"],
      ["2026-09", "200.00", "0.00", "100.00"],
    ]);
  });

  it("ordena por período aunque lleguen desordenados", () => {
    const r = posicionMensual([mes("2026-09", "200", "0"), mes("2026-08", "100", "150")]);
    expect(r.map((p) => p.periodo)).toEqual(["2026-08", "2026-09"]);
    expect(r[1]?.aPagar.aStringFiscal()).toBe("150.00");
  });

  it("acepta un saldo a favor inicial", () => {
    const r = posicionMensual([mes("2026-08", "100", "0")], ars("30"));
    expect(r[0]?.aPagar.aStringFiscal()).toBe("70.00");
  });
});

describe("determinadoImpuesto", () => {
  it("con importe fijo, es ese importe", () => {
    expect(
      determinadoImpuesto({ importeFijo: ars("4500"), base: null, alicuota: null }).aStringFiscal(),
    ).toBe("4500.00");
  });

  it("sin importe fijo, es base por alícuota", () => {
    expect(
      determinadoImpuesto({
        importeFijo: null,
        base: ars("1000"),
        alicuota: "3.5",
      }).aStringFiscal(),
    ).toBe("35.00");
  });

  it("sin nada, es cero", () => {
    expect(determinadoImpuesto({ importeFijo: null, base: null, alicuota: null }).esCero()).toBe(
      true,
    );
  });
});
