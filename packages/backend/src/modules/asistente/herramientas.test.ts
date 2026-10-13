import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import type { Sesion } from "../../trpc/context.js";
import { crearCliente } from "../clientes/service.js";
import { herramientasDeDatos, recortar } from "./herramientas.js";

// El panel trae la cotización del dólar: los tests no salen a internet.
vi.mock("../cotizaciones/dolar.js", () => ({
  cotizacionesDolar: async () => ({ oficial: null, blue: null }),
}));

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

function sesion(tenantId: string, usuarioId: string, extra: Partial<Sesion> = {}): Sesion {
  return {
    usuarioId,
    email: "prueba@demo.dev",
    nombre: "Prueba",
    activeOrganizationId: tenantId,
    rolOrganizacion: "solo_lectura",
    esAdminPlataforma: false,
    dosFactoresVerificado: false,
    esAccesoPorLink: false,
    modulosPermitidos: null,
    ...extra,
  };
}

/** Corre una herramienta como lo haría el modelo. */
async function usar(
  herramienta: { execute?: unknown } | undefined,
  input: unknown,
): Promise<unknown> {
  const execute = herramienta?.execute as
    | ((i: unknown, o: unknown) => Promise<unknown>)
    | undefined;
  if (!execute) {
    throw new Error("La herramienta no existe");
  }
  return execute(input, { toolCallId: "t", messages: [] });
}

describe("herramientas del asistente", () => {
  it("cada empresa ve sólo sus datos", async () => {
    const a = await crearTenantDePrueba();
    const b = await crearTenantDePrueba();
    await crearCliente(a, { razonSocial: "Cliente de A", condicionIva: "responsable_inscripto" });
    await crearCliente(b, { razonSocial: "Cliente de B", condicionIva: "responsable_inscripto" });

    const deA = herramientasDeDatos({
      session: sesion(a.tenantId, a.usuarioId),
      headers: new Headers(),
    });
    const r = (await usar(deA.buscar_clientes, {})) as { items: { razonSocial: string }[] };

    expect(r.items.map((c) => c.razonSocial)).toEqual(["Cliente de A"]);
  });

  it("un link de solo lectura no ve por el chat los módulos que no incluye", async () => {
    const t = await crearTenantDePrueba();
    await crearCliente(t, { razonSocial: "Visible", condicionIva: "responsable_inscripto" });
    const link = herramientasDeDatos({
      session: sesion(t.tenantId, t.usuarioId, {
        esAccesoPorLink: true,
        modulosPermitidos: ["clientes"],
      }),
      headers: new Headers(),
    });

    expect(await usar(link.buscar_clientes, {})).toMatchObject({
      items: [{ razonSocial: "Visible" }],
    });
    expect(await usar(link.panel_financiero, {})).toEqual({
      error: "Este usuario no tiene acceso a esa información.",
    });
    expect(await usar(link.estado_de_resultados, { meses: 3 })).toEqual({
      error: "Este usuario no tiene acceso a esa información.",
    });
  });

  it("no hay herramientas que escriban ni que exporten", () => {
    const nombres = Object.keys(
      herramientasDeDatos({ session: sesion("x", "y"), headers: new Headers() }),
    );
    expect(
      nombres.filter((n) => /crear|actualizar|borrar|eliminar|ajustar|exportar/.test(n)),
    ).toEqual([]);
  });

  it("ninguna herramienta usa modo estricto, que no admite filtros opcionales", () => {
    const todas = Object.values(
      herramientasDeDatos({ session: sesion("x", "y"), headers: new Headers() }),
    );
    expect(todas.every((h) => h.strict === false)).toBe(true);
  });
});

describe("recortar", () => {
  it("deja las primeras filas de un listado y avisa", () => {
    const r = recortar({ items: Array.from({ length: 40 }, (_, i) => i), total: 40 }) as {
      items: number[];
      total: number;
      nota?: string;
    };
    expect(r.items).toHaveLength(25);
    expect(r.total).toBe(40);
    expect(r.nota).toMatch(/25/);
  });

  it("un arreglo largo también se recorta", () => {
    const r = recortar(Array.from({ length: 30 }, (_, i) => i)) as {
      filas: number[];
      nota: string;
    };
    expect(r.filas).toHaveLength(25);
    expect(r.nota).toContain("25 de 30");
  });

  it("lo chico pasa igual", () => {
    expect(recortar({ a: 1 })).toEqual({ a: 1 });
  });
});
