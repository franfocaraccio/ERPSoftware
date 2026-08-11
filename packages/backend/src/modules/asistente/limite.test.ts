import { describe, expect, it } from "vitest";
import { crearContador, diaEnArgentina } from "./limite.js";

describe("diaEnArgentina", () => {
  it("usa la medianoche argentina y no la de UTC", () => {
    // 02:30 UTC del 12 son las 23:30 del 11 en Argentina (UTC-3). Si el corte
    // se hiciera en UTC, el cupo se renovaría media hora antes de tiempo.
    expect(diaEnArgentina(new Date("2026-08-12T02:30:00Z"))).toBe("2026-08-11");
    expect(diaEnArgentina(new Date("2026-08-12T03:30:00Z"))).toBe("2026-08-12");
  });
});

describe("crearContador", () => {
  it("deja pasar hasta el límite y después corta", () => {
    const consumir = crearContador({ limite: 3 });

    expect(consumir("empresa-a")).toEqual({ permitido: true, restantes: 2, limite: 3 });
    expect(consumir("empresa-a")).toEqual({ permitido: true, restantes: 1, limite: 3 });
    expect(consumir("empresa-a")).toEqual({ permitido: true, restantes: 0, limite: 3 });
    expect(consumir("empresa-a")).toEqual({ permitido: false, restantes: 0, limite: 3 });
  });

  it("sigue rechazando después del primer rechazo", () => {
    const consumir = crearContador({ limite: 1 });
    consumir("empresa-a");

    expect(consumir("empresa-a").permitido).toBe(false);
    expect(consumir("empresa-a").permitido).toBe(false);
  });

  it("cuenta por empresa: el cupo de una no afecta a la otra", () => {
    const consumir = crearContador({ limite: 1 });

    expect(consumir("empresa-a").permitido).toBe(true);
    expect(consumir("empresa-b").permitido).toBe(true);
    expect(consumir("empresa-a").permitido).toBe(false);
    expect(consumir("empresa-b").permitido).toBe(false);
  });

  it("renueva el cupo cuando cambia el día", () => {
    let ahora = new Date("2026-08-11T14:00:00Z");
    const consumir = crearContador({ limite: 2, reloj: () => ahora });

    consumir("empresa-a");
    consumir("empresa-a");
    expect(consumir("empresa-a").permitido).toBe(false);

    ahora = new Date("2026-08-12T14:00:00Z");
    expect(consumir("empresa-a")).toEqual({ permitido: true, restantes: 1, limite: 2 });
  });

  it("no renueva el cupo por cruzar la medianoche de UTC", () => {
    // 23:00 del 11 en Argentina son las 02:00 UTC del 12: cambió el día en UTC
    // pero todavía es el mismo día acá, así que el cupo NO se renueva.
    let ahora = new Date("2026-08-11T20:00:00Z");
    const consumir = crearContador({ limite: 1, reloj: () => ahora });

    consumir("empresa-a");
    ahora = new Date("2026-08-12T02:00:00Z");

    expect(consumir("empresa-a").permitido).toBe(false);
  });
});
