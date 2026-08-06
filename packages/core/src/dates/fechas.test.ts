import { describe, expect, it } from "vitest";
import { fechaISOEnZona, ZONA_ARGENTINA } from "./fechas.js";

describe("fechaISOEnZona", () => {
  it("devuelve la fecha local, no la UTC", () => {
    // 2026-08-06 01:30 UTC es todavía 2026-08-05 22:30 en Argentina (UTC−3).
    const instante = new Date("2026-08-06T01:30:00Z");
    expect(fechaISOEnZona(instante, ZONA_ARGENTINA)).toBe("2026-08-05");
  });

  it("coincide con UTC cuando la hora local no cruza el día", () => {
    const instante = new Date("2026-08-05T15:00:00Z");
    expect(fechaISOEnZona(instante, ZONA_ARGENTINA)).toBe("2026-08-05");
  });

  it("maneja el cambio de mes", () => {
    // 2026-09-01 02:00 UTC → 2026-08-31 23:00 en Argentina.
    const instante = new Date("2026-09-01T02:00:00Z");
    expect(fechaISOEnZona(instante, ZONA_ARGENTINA)).toBe("2026-08-31");
  });

  it("maneja el cambio de año", () => {
    const instante = new Date("2027-01-01T01:00:00Z");
    expect(fechaISOEnZona(instante, ZONA_ARGENTINA)).toBe("2026-12-31");
  });

  it("rellena mes y día con cero a la izquierda", () => {
    const instante = new Date("2026-03-07T15:00:00Z");
    expect(fechaISOEnZona(instante, ZONA_ARGENTINA)).toBe("2026-03-07");
  });
});
