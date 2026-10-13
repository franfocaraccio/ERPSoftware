import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { validarImputaciones } from "./validar-imputacion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");
const linea = (id: string, importe: string, disponible: string) => ({
  id,
  importe: ars(importe),
  disponible: ars(disponible),
});

describe("validarImputaciones", () => {
  it("acepta imputar parte del cobro y dejar el resto a cuenta", () => {
    expect(validarImputaciones(ars("100"), [linea("a", "60", "80")])).toBeNull();
  });

  it("acepta imputar el cobro entero entre varios comprobantes", () => {
    expect(
      validarImputaciones(ars("100"), [linea("a", "60", "60"), linea("b", "40", "90")]),
    ).toBeNull();
  });

  it("rechaza imputar más de lo que se cobró", () => {
    expect(
      validarImputaciones(ars("100"), [linea("a", "60", "60"), linea("b", "40.01", "90")]),
    ).toMatch(/más de lo que/);
  });

  it("rechaza imputar más de lo que le queda a un comprobante", () => {
    expect(validarImputaciones(ars("100"), [linea("a", "80.01", "80")])).toMatch(/le queda/);
  });

  it("rechaza el mismo comprobante dos veces", () => {
    expect(
      validarImputaciones(ars("100"), [linea("a", "10", "80"), linea("a", "10", "80")]),
    ).toMatch(/dos veces/);
  });

  it("rechaza importes en cero o negativos", () => {
    expect(validarImputaciones(ars("100"), [linea("a", "0", "80")])).toMatch(/mayor a cero/);
  });

  it("sin líneas no hay nada que validar", () => {
    expect(validarImputaciones(ars("100"), [])).toBeNull();
  });
});
