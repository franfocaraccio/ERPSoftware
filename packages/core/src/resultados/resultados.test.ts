import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { estadoResultados, ocurrenciasRecurrentes, rentabilidad } from "./resultados.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("estadoResultados", () => {
  it("arma el resultado del mes en cascada", () => {
    const [mes] = estadoResultados([
      {
        periodo: "2026-08",
        ventas: ars("1000"),
        costoVentas: ars("600"),
        gastos: [
          { categoria: "Sueldos", importe: ars("200") },
          { categoria: "Alquiler", importe: ars("50") },
        ],
        impuestosSobreVentas: ars("35"),
        otrosIngresos: ars("10"),
      },
    ]);
    expect(mes?.margenBruto.aStringFiscal()).toBe("400.00");
    expect(mes?.margenPorcentual).toBe("40.00");
    expect(mes?.totalGastos.aStringFiscal()).toBe("250.00");
    // 400 − 250 − 35
    expect(mes?.resultadoOperativo.aStringFiscal()).toBe("115.00");
    expect(mes?.resultadoNeto.aStringFiscal()).toBe("125.00");
  });

  it("agrupa los gastos de la misma categoría", () => {
    const [mes] = estadoResultados([
      {
        periodo: "2026-08",
        ventas: ars("0"),
        costoVentas: ars("0"),
        gastos: [
          { categoria: "Fletes", importe: ars("10") },
          { categoria: "Fletes", importe: ars("5") },
        ],
        impuestosSobreVentas: ars("0"),
        otrosIngresos: ars("0"),
      },
    ]);
    expect(mes?.gastos.map((g) => [g.categoria, g.importe.aStringFiscal()])).toEqual([
      ["Fletes", "15.00"],
    ]);
  });

  it("sin ventas no hay margen porcentual, y el resultado puede ser negativo", () => {
    const [mes] = estadoResultados([
      {
        periodo: "2026-08",
        ventas: ars("0"),
        costoVentas: ars("0"),
        gastos: [{ categoria: "Alquiler", importe: ars("100") }],
        impuestosSobreVentas: ars("0"),
        otrosIngresos: ars("0"),
      },
    ]);
    expect(mes?.margenPorcentual).toBeNull();
    expect(mes?.resultadoNeto.aStringFiscal()).toBe("-100.00");
  });
});

describe("ocurrenciasRecurrentes", () => {
  const sueldo = { id: "s", importe: ars("1000"), dia: 5, desde: "2026-01-01", hasta: null };

  it("genera una por mes en el día pactado, dentro del rango", () => {
    expect(
      ocurrenciasRecurrentes([sueldo], "2026-08-10", "2026-10-31").map((o) => o.fecha),
    ).toEqual(["2026-09-05", "2026-10-05"]);
  });

  it("incluye el día de hoy si coincide", () => {
    expect(
      ocurrenciasRecurrentes([sueldo], "2026-08-05", "2026-08-31").map((o) => o.fecha),
    ).toEqual(["2026-08-05"]);
  });

  it("respeta desde y hasta de la plantilla", () => {
    const temporal = { ...sueldo, desde: "2026-09-01", hasta: "2026-09-30" };
    expect(
      ocurrenciasRecurrentes([temporal], "2026-08-01", "2026-12-31").map((o) => o.fecha),
    ).toEqual(["2026-09-05"]);
  });

  it("un día que el mes no tiene cae en el último día del mes", () => {
    const fin = { ...sueldo, dia: 31 };
    expect(ocurrenciasRecurrentes([fin], "2026-02-01", "2026-02-28").map((o) => o.fecha)).toEqual([
      "2026-02-28",
    ]);
  });
});

describe("rentabilidad", () => {
  it("agrupa ventas y costo por clave y calcula el margen", () => {
    const r = rentabilidad([
      { clave: "A", ventas: ars("100"), costo: ars("60") },
      { clave: "A", ventas: ars("100"), costo: ars("40") },
      { clave: "B", ventas: ars("50"), costo: ars("45") },
    ]);
    expect(r.map((x) => [x.clave, x.margen.aStringFiscal(), x.margenPorcentual])).toEqual([
      ["A", "100.00", "50.00"],
      ["B", "5.00", "10.00"],
    ]);
  });

  it("ordena por margen, de mayor a menor", () => {
    const r = rentabilidad([
      { clave: "chico", ventas: ars("10"), costo: ars("9") },
      { clave: "grande", ventas: ars("100"), costo: ars("10") },
    ]);
    expect(r.map((x) => x.clave)).toEqual(["grande", "chico"]);
  });
  it("con cantidades, da el precio y el costo unitario promedio", () => {
    // 2 a 100 de costo y 3 a 120: costo 560 por 5 unidades, 112 promedio.
    const [fila] = rentabilidad([
      { clave: "Hierro", ventas: ars("400"), costo: ars("200"), cantidad: "2" },
      { clave: "Hierro", ventas: ars("600"), costo: ars("360"), cantidad: "3" },
    ]);
    expect(fila?.cantidad).toBe("5");
    expect(fila?.precioPromedio?.aStringFiscal()).toBe("200.00");
    expect(fila?.costoPromedio?.aStringFiscal()).toBe("112.00");
  });

  it("sin cantidades o con cantidad cero, no hay promedios", () => {
    const [sin] = rentabilidad([{ clave: "A", ventas: ars("10"), costo: ars("5") }]);
    expect(sin?.costoPromedio).toBeNull();
    const [cero] = rentabilidad([
      { clave: "A", ventas: ars("10"), costo: ars("5"), cantidad: "0" },
    ]);
    expect(cero?.precioPromedio).toBeNull();
  });
});
