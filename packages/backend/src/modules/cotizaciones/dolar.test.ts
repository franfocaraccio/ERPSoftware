import { beforeEach, describe, expect, it, vi } from "vitest";
import { dolarOficial, limpiarCache } from "./dolar.js";

/** Una respuesta con la forma real que devuelve la fuente. */
function respuesta(compra: number, venta: number, fecha = "2026-10-09T18:55:00.000Z"): Response {
  return new Response(
    JSON.stringify({
      moneda: "USD",
      casa: "oficial",
      nombre: "Oficial",
      compra,
      venta,
      fechaActualizacion: fecha,
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  limpiarCache();
});

describe("dolarOficial", () => {
  it("devuelve las dos puntas, como strings", async () => {
    const traer = vi.fn(async () => respuesta(1485, 1535));
    // Los valores viajan como string: los decimales no se operan como number.
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toEqual({
      compra: "1485.00",
      venta: "1535.00",
      fecha: "2026-10-09T18:55:00.000Z",
    });
  });

  it("conserva los decimales que vengan", async () => {
    const traer = vi.fn(async () => respuesta(1485.5, 1535.9));
    const r = await dolarOficial(Date.now, traer as unknown as typeof fetch);
    expect(r?.compra).toBe("1485.50");
    expect(r?.venta).toBe("1535.90");
  });

  it("no vuelve a consultar mientras la cotización siga fresca", async () => {
    const traer = vi.fn(async () => respuesta(1485, 1535));
    const reloj = () => 1_000_000;
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar cuando pasó la vigencia", async () => {
    const traer = vi.fn(async () => respuesta(1485, 1535));
    let ahora = 1_000_000;
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000;
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("si la fuente no contesta devuelve null en vez de romper el panel", async () => {
    const traer = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("si la fuente responde con error devuelve null", async () => {
    const traer = vi.fn(async () => new Response("nope", { status: 503 }));
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("si falta una de las dos puntas no inventa un valor", async () => {
    // Preferimos no mostrar cotización antes que mostrar media.
    const traer = vi.fn(
      async () =>
        new Response(JSON.stringify({ venta: 1535, fechaActualizacion: "2026-10-09" }), {
          status: 200,
        }),
    );
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("ante una caída posterior sigue mostrando la última cotización conocida", async () => {
    let ahora = 1_000_000;
    const traer = vi
      .fn()
      .mockResolvedValueOnce(respuesta(1485, 1535))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000;
    const r = await dolarOficial(() => ahora, traer as unknown as typeof fetch);

    // Con su fecha a la vista, un dato de ayer es mejor que un guion.
    expect(r?.venta).toBe("1535.00");
  });
});
