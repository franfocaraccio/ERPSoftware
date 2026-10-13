import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { variacion } from "./comparar.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("variacion", () => {
  it("diferencia y porcentaje contra el anterior", () => {
    const v = variacion(ars("1100"), ars("1000"));
    expect(v.diferencia.aStringFiscal()).toBe("100.00");
    expect(v.porcentaje).toBe("10.00");
  });

  it("una baja da porcentaje negativo", () => {
    expect(variacion(ars("750"), ars("1000")).porcentaje).toBe("-25.00");
  });

  it("contra cero no hay porcentaje", () => {
    expect(variacion(ars("100"), ars("0")).porcentaje).toBeNull();
  });

  it("contra un anterior negativo, el porcentaje usa su valor absoluto", () => {
    // De −100 a +50 es una mejora: el porcentaje tiene que ser positivo.
    expect(variacion(ars("50"), ars("-100")).porcentaje).toBe("150.00");
  });
});
