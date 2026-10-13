import { describe, expect, it } from "vitest";
import { formatearFecha, formatearFechaHora, formatearImporte } from "./formato.js";

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

describe("formatearFechaHora", () => {
  it("usa dd/mm/aaaa y hora de 24 horas, en hora argentina", () => {
    // 22:22 UTC son las 19:22 en Buenos Aires (UTC−3).
    expect(formatearFechaHora("2026-10-12T22:22:00Z")).toBe("12/10/2026 19:22");
  });

  it("cambia de día según la hora argentina, no la UTC", () => {
    // 01:30 UTC del 13 sigue siendo el 12 a las 22:30 en Argentina.
    expect(formatearFechaHora("2026-10-13T01:30:00Z")).toBe("12/10/2026 22:30");
  });

  it("acepta un Date", () => {
    expect(formatearFechaHora(new Date("2026-01-05T12:05:00Z"))).toBe("05/01/2026 09:05");
  });
});
