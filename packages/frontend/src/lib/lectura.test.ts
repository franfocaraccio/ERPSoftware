import { describe, expect, it } from "vitest";
import type { LecturaVenta } from "./lectura.js";
import { guardarLecturaPendiente, tomarLecturaPendiente } from "./lectura.js";

const LECTURA = {
  tipo: "venta",
  contraparteId: null,
  archivo: { nombre: "f.pdf", hash: "a".repeat(64) },
  propuesta: { items: [], reparos: [] },
} as unknown as LecturaVenta;

describe("la lectura que espera al formulario", () => {
  it("sin nada guardado no devuelve nada", () => {
    expect(tomarLecturaPendiente()).toBeNull();
  });

  it("se entrega una sola vez", () => {
    // Si quedara guardada, entrar de nuevo a cargar un comprobante mostraría
    // el formulario precargado con la factura anterior, y alguien podría
    // guardarla dos veces sin darse cuenta.
    guardarLecturaPendiente(LECTURA);
    expect(tomarLecturaPendiente()).toBe(LECTURA);
    expect(tomarLecturaPendiente()).toBeNull();
  });

  it("la última pisa a la anterior", () => {
    const otra = { ...LECTURA, archivo: { nombre: "g.pdf", hash: "b".repeat(64) } };
    guardarLecturaPendiente(LECTURA);
    guardarLecturaPendiente(otra);
    expect(tomarLecturaPendiente()).toBe(otra);
  });
});
