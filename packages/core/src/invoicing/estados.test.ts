import { describe, expect, it } from "vitest";
import { attemptTransition, esEditable, eventosDisponibles } from "./estados.js";

describe("attemptTransition", () => {
  it("borrador → enviada con el evento emitir", () => {
    const r = attemptTransition("borrador", "emitir");
    expect(r).toEqual({ ok: true, siguiente: "enviada" });
  });

  it("enviada → aprobada cuando ARCA autoriza", () => {
    expect(attemptTransition("enviada", "aprobar")).toEqual({ ok: true, siguiente: "aprobada" });
  });

  it("enviada → rechazada cuando ARCA rechaza", () => {
    expect(attemptTransition("enviada", "rechazar")).toEqual({ ok: true, siguiente: "rechazada" });
  });

  it("un rechazo permite volver a borrador para corregir", () => {
    expect(attemptTransition("rechazada", "corregir")).toEqual({ ok: true, siguiente: "borrador" });
  });

  it("un comprobante aprobado es inmutable: ningún evento lo saca de ahí", () => {
    for (const evento of ["emitir", "aprobar", "rechazar", "corregir"] as const) {
      const r = attemptTransition("aprobada", evento);
      expect(r.ok).toBe(false);
    }
  });

  it("no se puede aprobar un borrador sin pasar por enviada", () => {
    const r = attemptTransition("borrador", "aprobar");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("borrador");
    }
  });

  it("no se puede emitir dos veces", () => {
    expect(attemptTransition("enviada", "emitir").ok).toBe(false);
  });
});

describe("eventosDisponibles", () => {
  it("expone lo que el frontend puede ofrecer en cada estado", () => {
    expect(eventosDisponibles("borrador")).toEqual(["emitir"]);
    expect(eventosDisponibles("enviada")).toEqual(["aprobar", "rechazar"]);
    expect(eventosDisponibles("rechazada")).toEqual(["corregir"]);
    expect(eventosDisponibles("aprobada")).toEqual([]);
  });
});

describe("esEditable", () => {
  it("solo el borrador es editable por el usuario", () => {
    expect(esEditable("borrador")).toBe(true);
    expect(esEditable("enviada")).toBe(false);
    expect(esEditable("aprobada")).toBe(false);
    expect(esEditable("rechazada")).toBe(false);
  });
});
