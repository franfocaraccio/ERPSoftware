import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { revisarTotalesLeidos, type TotalesLeidos } from "./lectura.js";

/**
 * Los casos salen de tres facturas reales, no de ejemplos inventados: una A en
 * dólares, una C de monotributo y una B de consumidor final. Cada una rompe
 * una suposición distinta sobre cómo cierra un total.
 */

const ars = (v: string) => Money.desdeString(v, "ARS");
const usd = (v: string) => Money.desdeString(v, "USD");

function totales(parcial: Partial<TotalesLeidos> = {}): TotalesLeidos {
  return {
    letra: "A",
    neto: ars("10000.00"),
    iva: ars("2100.00"),
    otrosTributos: ars("0.00"),
    total: ars("12100.00"),
    ...parcial,
  };
}

describe("revisarTotalesLeidos", () => {
  it("una factura A que cierra no tiene reparos", () => {
    // Líder Gestión: neto 10000 + IVA 21% 2100 = 12100, en dólares.
    expect(
      revisarTotalesLeidos({
        letra: "A",
        neto: usd("10000.00"),
        iva: usd("2100.00"),
        otrosTributos: usd("0.00"),
        total: usd("12100.00"),
      }),
    ).toEqual([]);
  });

  it("suma los otros tributos al verificar una A", () => {
    expect(
      revisarTotalesLeidos(totales({ otrosTributos: ars("500.00"), total: ars("12600.00") })),
    ).toEqual([]);
  });

  it("marca la A cuyo total no cierra, sin corregirlo", () => {
    // Corregir solo sería peor que marcar: el que está mal puede ser
    // cualquiera de los tres números, y sólo una persona mirando el papel
    // sabe cuál.
    const reparos = revisarTotalesLeidos(totales({ total: ars("12000.00") }));
    expect(reparos).toHaveLength(1);
    expect(reparos[0]?.tipo).toBe("total_no_cierra");
    expect(reparos[0]?.tipo === "total_no_cierra" && reparos[0].esperado.aStringFiscal()).toBe(
      "12100.00",
    );
  });

  it("una factura C cierra sin IVA", () => {
    // Focaraccio Francisco, monotributo: 3.500.000 y ni una línea de IVA.
    expect(
      revisarTotalesLeidos({
        letra: "C",
        neto: ars("3500000.00"),
        iva: ars("0.00"),
        total: ars("3500000.00"),
      }),
    ).toEqual([]);
  });

  it("en una B el IVA va incluido, así que el total es el neto", () => {
    // Farmcity: total 7963, y abajo "IVA Contenido: 1382,01" por el régimen
    // de transparencia fiscal. Está adentro de esos 7963, no se suma.
    expect(
      revisarTotalesLeidos({
        letra: "B",
        neto: ars("7963.00"),
        iva: ars("0.00"),
        total: ars("7963.00"),
      }),
    ).toEqual([]);
  });

  it("marca el IVA cargado como si sumara en una B o una C", () => {
    // El error que importa: tomar el "IVA contenido" de una B como un IVA
    // discriminado. Sumado daría 9345,01 y el comprobante quedaría cargado
    // por 1382 pesos de más.
    for (const letra of ["B", "C"] as const) {
      const reparos = revisarTotalesLeidos({
        letra,
        neto: ars("7963.00"),
        iva: ars("1382.01"),
        total: ars("7963.00"),
      });
      expect(reparos.map((r) => r.tipo)).toEqual(["iva_sin_discriminar"]);
    }
  });

  it("junta los dos reparos cuando valen los dos", () => {
    const reparos = revisarTotalesLeidos({
      letra: "B",
      neto: ars("7963.00"),
      iva: ars("1382.01"),
      total: ars("9000.00"),
    });
    expect(reparos.map((r) => r.tipo).sort()).toEqual(["iva_sin_discriminar", "total_no_cierra"]);
  });

  it("no acepta mezclar monedas", () => {
    // Un neto en dólares con un total en pesos es una lectura rota, no una
    // conversión: el tipo de cambio no se adivina.
    expect(() =>
      revisarTotalesLeidos(totales({ neto: usd("10000.00"), total: ars("12100.00") })),
    ).toThrow();
  });
});
