import { describe, expect, it } from "vitest";
import { normalizarCuit, validarCuit } from "./cuit.js";

describe("validarCuit", () => {
  it("acepta CUITs reales con dígito verificador correcto", () => {
    expect(validarCuit("33693450239")).toBe(true); // AFIP/ARCA
    expect(validarCuit("30703088534")).toBe(true);
  });

  it("acepta el formato con guiones", () => {
    expect(validarCuit("33-69345023-9")).toBe(true);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    expect(validarCuit("33693450230")).toBe(false);
    expect(validarCuit("33693450238")).toBe(false);
  });

  it("rechaza longitudes distintas de 11 dígitos", () => {
    expect(validarCuit("3369345023")).toBe(false);
    expect(validarCuit("336934502390")).toBe(false);
    expect(validarCuit("")).toBe(false);
  });

  it("rechaza caracteres no numéricos", () => {
    expect(validarCuit("33-6934502A-9")).toBe(false);
    expect(validarCuit("abcdefghijk")).toBe(false);
  });

  it("rechaza prefijos cuyo verificador daría 10 (ARCA no los emite)", () => {
    // 2000000001 → suma ponderada 12 → resto 1 → dv 10 → inválido con cualquier final
    for (let dv = 0; dv <= 9; dv++) {
      expect(validarCuit(`2000000001${dv}`)).toBe(false);
    }
  });
});

describe("normalizarCuit", () => {
  it("quita guiones y espacios", () => {
    expect(normalizarCuit("33-69345023-9")).toBe("33693450239");
    expect(normalizarCuit(" 33 69345023 9 ")).toBe("33693450239");
  });
});
