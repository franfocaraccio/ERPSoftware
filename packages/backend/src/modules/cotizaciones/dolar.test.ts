import { beforeEach, describe, expect, it, vi } from "vitest";
import { cotizacionesDolar, limpiarCache } from "./dolar.js";

/** Una respuesta con la forma real que devuelve la fuente. */
function respuesta(opciones: {
  compra?: string;
  venta?: string;
  fecha?: string;
  variacion?: string;
  clase?: string;
}): Response {
  return new Response(
    JSON.stringify({
      compra: opciones.compra ?? "1483,80",
      venta: opciones.venta ?? "1537,18",
      fecha: opciones.fecha ?? "09/10/2026 - 15:50",
      variacion: opciones.variacion ?? "-0,14%",
      "class-variacion": opciones.clase ?? "down",
      valor_cierre_ant: "1539,30",
    }),
    { status: 200 },
  );
}

/** Responde distinto según la plaza, mirando la URL. */
function fuente(porPlaza: { oficial: () => Promise<Response>; blue: () => Promise<Response> }) {
  const f: typeof fetch = async (url) =>
    String(url).includes("informal") ? porPlaza.blue() : porPlaza.oficial();
  return f;
}

const OK = () => Promise.resolve(respuesta({}));

beforeEach(() => {
  limpiarCache();
});

describe("cotizacionesDolar", () => {
  it("trae las dos plazas, con sus puntas y su variación", async () => {
    const traer = fuente({
      oficial: () => Promise.resolve(respuesta({})),
      blue: () =>
        Promise.resolve(
          respuesta({ compra: "1520,00", venta: "1540,00", variacion: "0,00%", clase: "equal" }),
        ),
    });

    const r = await cotizacionesDolar(Date.now, traer);
    // Entra con coma decimal y sale con punto, como string.
    expect(r.oficial).toEqual({
      compra: "1483.80",
      venta: "1537.18",
      fecha: "2026-10-09",
      variacion: "-0.14",
      tendencia: "baja",
    });
    expect(r.blue?.venta).toBe("1540.00");
    expect(r.blue?.tendencia).toBe("igual");
  });

  it("traduce las tres tendencias", async () => {
    for (const [clase, esperada] of [
      ["up", "sube"],
      ["down", "baja"],
      ["equal", "igual"],
    ] as const) {
      limpiarCache();
      const traer = fuente({
        oficial: () => Promise.resolve(respuesta({ clase })),
        blue: OK,
      });
      expect((await cotizacionesDolar(Date.now, traer)).oficial?.tendencia).toBe(esperada);
    }
  });

  it("una clase desconocida no tira la cotización", async () => {
    // El importe sigue siendo bueno; la flecha es un agregado.
    const traer = fuente({
      oficial: () => Promise.resolve(respuesta({ clase: "sideways" })),
      blue: OK,
    });
    const r = await cotizacionesDolar(Date.now, traer);
    expect(r.oficial?.venta).toBe("1537.18");
    expect(r.oficial?.tendencia).toBe("igual");
  });

  it("saca el punto de miles y el signo de porcentaje", async () => {
    const traer = fuente({
      oficial: () => Promise.resolve(respuesta({ compra: "1.483,80", variacion: "-1,25%" })),
      blue: OK,
    });
    const r = await cotizacionesDolar(Date.now, traer);
    expect(r.oficial?.compra).toBe("1483.80");
    expect(r.oficial?.variacion).toBe("-1.25");
  });

  it("convierte la fecha a ISO sin construir un Date", async () => {
    // Construir un Date con la fecha la correría un día por la zona horaria.
    const traer = fuente({
      oficial: () => Promise.resolve(respuesta({ fecha: "01/02/2026 - 09:00" })),
      blue: OK,
    });
    expect((await cotizacionesDolar(Date.now, traer)).oficial?.fecha).toBe("2026-02-01");
  });

  it("se identifica al llamar: sin User-Agent la fuente responde 403", async () => {
    let enviados: Record<string, string> | undefined;
    const traer: typeof fetch = async (_url, opciones) => {
      enviados ??= opciones?.headers as Record<string, string> | undefined;
      return respuesta({});
    };
    await cotizacionesDolar(Date.now, traer);
    expect(enviados?.["User-Agent"]).toBeTruthy();
  });

  it("si falla una plaza, la otra se muestra igual", async () => {
    const traer = fuente({
      oficial: OK,
      blue: () => Promise.reject(new Error("ECONNRESET")),
    });
    const r = await cotizacionesDolar(Date.now, traer);
    expect(r.oficial?.venta).toBe("1537.18");
    expect(r.blue).toBeNull();
  });

  it("si un importe viene con formato raro, esa plaza queda en null y la otra no", async () => {
    const traer = fuente({
      oficial: () => Promise.resolve(respuesta({ venta: "mil quinientos" })),
      blue: OK,
    });
    const r = await cotizacionesDolar(Date.now, traer);
    expect(r.oficial).toBeNull();
    expect(r.blue?.venta).toBe("1537.18");
  });

  it("no vuelve a consultar mientras las cotizaciones sigan frescas", async () => {
    const traer = vi.fn(async () => respuesta({}));
    const reloj = () => 1_000_000;
    await cotizacionesDolar(reloj, traer as unknown as typeof fetch);
    await cotizacionesDolar(reloj, traer as unknown as typeof fetch);
    // Dos llamadas de la primera vuelta —una por plaza— y ninguna de la segunda.
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("vuelve a consultar cuando pasó la vigencia", async () => {
    const traer = vi.fn(async () => respuesta({}));
    let ahora = 1_000_000;
    await cotizacionesDolar(() => ahora, traer as unknown as typeof fetch);
    ahora += 31 * 60 * 1000;
    await cotizacionesDolar(() => ahora, traer as unknown as typeof fetch);
    expect(traer).toHaveBeenCalledTimes(4);
  });

  it("ante una caída posterior sigue mostrando la última cotización conocida", async () => {
    let ahora = 1_000_000;
    let caer = false;
    const traer: typeof fetch = async () => {
      if (caer) {
        throw new Error("ETIMEDOUT");
      }
      return respuesta({});
    };

    await cotizacionesDolar(() => ahora, traer);
    caer = true;
    ahora += 31 * 60 * 1000;
    // Con su fecha a la vista, un dato de ayer es mejor que un guion.
    expect((await cotizacionesDolar(() => ahora, traer)).oficial?.venta).toBe("1537.18");
  });

  it("con las dos plazas caídas no cachea el vacío", async () => {
    let intentos = 0;
    const traer: typeof fetch = async () => {
      intentos++;
      throw new Error("ECONNRESET");
    };
    const reloj = () => 1_000_000;

    await cotizacionesDolar(reloj, traer);
    await cotizacionesDolar(reloj, traer);
    // Conviene reintentar en la próxima visita, no esperar media hora.
    expect(intentos).toBe(4);
  });
});
