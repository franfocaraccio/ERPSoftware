import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { separarVencidos } from "./vencidos.js";

const ars = (v: string) => Money.desdeString(v, "ARS");
const mov = (fecha: string, importe: string) => ({ fecha, importe: ars(importe) });

describe("separarVencidos", () => {
  it("vencido es lo que vencía antes de hoy; hoy todavía no venció", () => {
    const r = separarVencidos([mov("2026-08-04", "10"), mov("2026-08-05", "20")], "2026-08-05");
    expect(r.vigentes.map((m) => m.fecha)).toEqual(["2026-08-05"]);
    expect(r.vencidos.map((m) => m.fecha)).toEqual(["2026-08-04"]);
  });

  it("suma el total vencido", () => {
    const r = separarVencidos(
      [mov("2026-07-01", "10.10"), mov("2026-07-20", "5"), mov("2026-09-01", "99")],
      "2026-08-05",
    );
    expect(r.totalVencido.aStringFiscal()).toBe("15.10");
  });

  it("sin vencidos, el total es cero", () => {
    const r = separarVencidos([mov("2026-09-01", "99")], "2026-08-05");
    expect(r.totalVencido.esCero()).toBe(true);
  });

  it("la lista vacía no rompe", () => {
    const r = separarVencidos([], "2026-08-05");
    expect(r.vigentes).toEqual([]);
    expect(r.totalVencido.esCero()).toBe(true);
  });

  it("al reprogramar, lo vencido pasa a hoy con su importe", () => {
    const r = separarVencidos([mov("2026-07-01", "10")], "2026-08-05");
    expect(r.vencidosAHoy.map((m) => [m.fecha, m.importe.aStringFiscal()])).toEqual([
      ["2026-08-05", "10.00"],
    ]);
  });
});
