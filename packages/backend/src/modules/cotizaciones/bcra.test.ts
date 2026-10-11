import { beforeEach, describe, expect, it, vi } from "vitest";
import { dolarOficial, limpiarCache } from "./bcra.js";

/** Una respuesta del BCRA con la forma real que devuelve la API. */
function respuestaBcra(valor: number, fecha: string): Response {
  return new Response(
    JSON.stringify({
      status: 200,
      results: [
        {
          idVariable: 4,
          detalle: [
            { fecha, valor },
            { fecha: "2026-10-08", valor: 1539.3 },
          ],
        },
      ],
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  limpiarCache();
});

describe("dolarOficial", () => {
  it("devuelve el último valor publicado, como string", async () => {
    const traer = vi.fn(async () => respuestaBcra(1537.18, "2026-10-09"));
    const r = await dolarOficial(Date.now, traer as unknown as typeof fetch);
    // El valor viaja como string: los decimales no se operan como number.
    expect(r).toEqual({ valor: "1537.18", fecha: "2026-10-09" });
  });

  it("no vuelve a consultar al BCRA mientras la cotización siga fresca", async () => {
    const traer = vi.fn(async () => respuestaBcra(1537.18, "2026-10-09"));
    const reloj = () => 1_000_000;
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar cuando pasó la vigencia", async () => {
    const traer = vi.fn(async () => respuestaBcra(1537.18, "2026-10-09"));
    let ahora = 1_000_000;
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000; // una hora y un minuto después
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("si el BCRA no contesta devuelve null en vez de romper el panel", async () => {
    const traer = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("si el BCRA responde con error devuelve null", async () => {
    const traer = vi.fn(async () => new Response("nope", { status: 503 }));
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("si la respuesta cambió de forma no inventa un valor", async () => {
    // Preferimos no mostrar cotización antes que mostrar cualquier cosa.
    const traer = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    expect(await dolarOficial(Date.now, traer as unknown as typeof fetch)).toBeNull();
  });

  it("ante una caída posterior sigue mostrando la última cotización conocida", async () => {
    let ahora = 1_000_000;
    const traer = vi
      .fn()
      .mockResolvedValueOnce(respuestaBcra(1537.18, "2026-10-09"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000;
    const r = await dolarOficial(() => ahora, traer as unknown as typeof fetch);

    // Con su fecha a la vista, un dato de ayer es mejor que un guion.
    expect(r).toEqual({ valor: "1537.18", fecha: "2026-10-09" });
  });
});
