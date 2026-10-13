import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { sugerenciaCompra } from "./reposicion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("sugerenciaCompra", () => {
  it("con stock sobre el mínimo, no sugiere nada", () => {
    expect(
      sugerenciaCompra({ stock: "40", minimo: "30", salidas30Dias: "50" }, ars("10")),
    ).toBeNull();
  });

  it("repone hasta el mínimo más lo que salió en los últimos 30 días", () => {
    // Quedan 10, el mínimo es 30 y salieron 50 en un mes: hay que llegar a 80.
    const s = sugerenciaCompra({ stock: "10", minimo: "30", salidas30Dias: "50" }, ars("100"));
    expect(s?.cantidad).toBe("70");
    expect(s?.importe?.aStringFiscal()).toBe("7000.00");
  });

  it("sin salidas en el mes, repone hasta el doble del mínimo", () => {
    // Sin historia de consumo, la única referencia es el mínimo.
    const s = sugerenciaCompra({ stock: "140", minimo: "150", salidas30Dias: "0" }, null);
    expect(s?.cantidad).toBe("160");
    expect(s?.importe).toBeNull();
  });

  it("en el mínimo justo también sugiere (el semáforo ya dice Reponer)", () => {
    expect(
      sugerenciaCompra({ stock: "30", minimo: "30", salidas30Dias: "12" }, null)?.cantidad,
    ).toBe("12");
  });

  it("con stock negativo, cubre también lo que se vendió sin tener", () => {
    expect(
      sugerenciaCompra({ stock: "-5", minimo: "10", salidas30Dias: "20" }, null)?.cantidad,
    ).toBe("35");
  });

  it("redondea hacia arriba a 3 decimales y valúa al centavo", () => {
    const s = sugerenciaCompra({ stock: "1.5", minimo: "2", salidas30Dias: "0.25" }, ars("33.33"));
    expect(s?.cantidad).toBe("0.75");
    expect(s?.importe?.aStringFiscal()).toBe("25.00");
  });

  it("sin mínimo cargado (cero) no sugiere", () => {
    expect(sugerenciaCompra({ stock: "0", minimo: "0", salidas30Dias: "0" }, null)).toBeNull();
  });
});
