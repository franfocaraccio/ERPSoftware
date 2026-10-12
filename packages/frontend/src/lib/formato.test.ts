import { describe, expect, it } from "vitest";
import { formatearFecha, formatearImporte } from "./formato.js";

describe("formatearImporte", () => {
  it("formatea en pesos argentinos", () => {
    expect(formatearImporte("1485.00").replace(/ /g, " ")).toBe("$ 1.485,00");
  });

  it("respeta la moneda que se le pase", () => {
    expect(formatearImporte("900.00", "USD")).toContain("900,00");
  });

  it("sin valor muestra un guion", () => {
    expect(formatearImporte(null)).toBe("—");
    expect(formatearImporte(undefined)).toBe("—");
  });

  it("nunca muestra NaN", () => {
    // Pasa cuando el servidor manda una forma distinta a la que el bundle
    // espera —un deploy a medias— y el campo llega indefinido o con basura.
    // Un "$ NaN" parece un importe y no lo es; el guion dice la verdad.
    expect(formatearImporte("")).toBe("—");
    expect(formatearImporte("ochocientos")).toBe("—");
    expect(formatearImporte(undefined)).not.toContain("NaN");
  });

  it("el cero es un importe, no la falta de uno", () => {
    expect(formatearImporte("0.00").replace(/ /g, " ")).toBe("$ 0,00");
  });

  it("los negativos mantienen el signo", () => {
    expect(formatearImporte("-5000.00")).toContain("5.000,00");
    expect(formatearImporte("-5000.00")).toContain("-");
  });
});

describe("formatearFecha", () => {
  it("da vuelta el ISO a día/mes/año", () => {
    expect(formatearFecha("2026-10-09")).toBe("09/10/2026");
  });

  it("de un instante con hora se queda con el día", () => {
    expect(formatearFecha("2026-10-09T18:55:00.000Z")).toBe("09/10/2026");
  });

  it("no adelanta ni atrasa el día", () => {
    // Construir un Date con "2026-10-09" da medianoche UTC, que mostrada en
    // hora argentina cae en el 8. Por eso acá se corta el string y no se
    // construye ningún Date.
    expect(formatearFecha("2026-10-09")).not.toContain("08/10");
    expect(formatearFecha("2026-01-01")).toBe("01/01/2026");
  });

  it("sin fecha muestra un guion", () => {
    expect(formatearFecha(null)).toBe("—");
    expect(formatearFecha("")).toBe("—");
  });
});
