import { beforeEach, describe, expect, it, vi } from "vitest";
import { dolarOficial, limpiarCache } from "./dolar.js";

/** Una respuesta con la forma real que devuelve la fuente. */
function respuesta(compra: string, venta: string, fecha = "09/10/2026 - 15:50"): Response {
  return new Response(
    JSON.stringify({
      compra,
      venta,
      fecha,
      variacion: "-0,14%",
      "class-variacion": "down",
      valor_cierre_ant: "1539,30",
    }),
    { status: 200 },
  );
}

const traerQue = (r: () => Promise<Response>) => vi.fn(r) as unknown as typeof fetch;

beforeEach(() => {
  limpiarCache();
});

describe("dolarOficial", () => {
  it("devuelve las dos puntas en formato decimal", async () => {
    const traer = traerQue(async () => respuesta("1483,80", "1537,18"));
    // Entra con coma decimal y sale con punto, como string: los decimales no se
    // operan como number en ningún momento.
    expect(await dolarOficial(Date.now, traer)).toEqual({
      compra: "1483.80",
      venta: "1537.18",
      fecha: "2026-10-09",
    });
  });

  it("saca el punto de miles", async () => {
    const traer = traerQue(async () => respuesta("1.483,80", "1.537,18"));
    const r = await dolarOficial(Date.now, traer);
    expect(r?.compra).toBe("1483.80");
    expect(r?.venta).toBe("1537.18");
  });

  it("convierte la fecha a ISO sin construir un Date", async () => {
    // Construir un Date con la fecha la correría un día por la zona horaria.
    const traer = traerQue(async () => respuesta("1000,00", "1100,00", "01/02/2026 - 09:00"));
    expect((await dolarOficial(Date.now, traer))?.fecha).toBe("2026-02-01");
  });

  it("se identifica al llamar: sin User-Agent la fuente responde 403", async () => {
    let enviados: Record<string, string> | undefined;
    const traer: typeof fetch = async (_url, opciones) => {
      enviados = opciones?.headers as Record<string, string> | undefined;
      return respuesta("1483,80", "1537,18");
    };
    await dolarOficial(Date.now, traer);
    expect(enviados?.["User-Agent"]).toBeTruthy();
  });

  it("no vuelve a consultar mientras la cotización siga fresca", async () => {
    const traer = vi.fn(async () => respuesta("1483,80", "1537,18"));
    const reloj = () => 1_000_000;
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    await dolarOficial(reloj, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar cuando pasó la vigencia", async () => {
    const traer = vi.fn(async () => respuesta("1483,80", "1537,18"));
    let ahora = 1_000_000;
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000;
    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("si la fuente no contesta devuelve null en vez de romper el panel", async () => {
    const traer = traerQue(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await dolarOficial(Date.now, traer)).toBeNull();
  });

  it("si la fuente responde 403 devuelve null", async () => {
    const traer = traerQue(async () => new Response("Forbidden", { status: 403 }));
    expect(await dolarOficial(Date.now, traer)).toBeNull();
  });

  it("si el importe viene con un formato raro no inventa un número", async () => {
    // Preferimos no mostrar cotización antes que mostrar basura con signo peso.
    const traer = traerQue(async () => respuesta("mil cuatrocientos", "1537,18"));
    expect(await dolarOficial(Date.now, traer)).toBeNull();
  });

  it("si falta una de las dos puntas tampoco inventa", async () => {
    const traer = traerQue(
      async () => new Response(JSON.stringify({ venta: "1537,18", fecha: "09/10/2026" })),
    );
    expect(await dolarOficial(Date.now, traer)).toBeNull();
  });

  it("ante una caída posterior sigue mostrando la última cotización conocida", async () => {
    let ahora = 1_000_000;
    const traer = vi
      .fn()
      .mockResolvedValueOnce(respuesta("1483,80", "1537,18"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

    await dolarOficial(() => ahora, traer as unknown as typeof fetch);
    ahora += 61 * 60 * 1000;
    // Con su fecha a la vista, un dato de ayer es mejor que un guion.
    expect((await dolarOficial(() => ahora, traer as unknown as typeof fetch))?.venta).toBe(
      "1537.18",
    );
  });
});
