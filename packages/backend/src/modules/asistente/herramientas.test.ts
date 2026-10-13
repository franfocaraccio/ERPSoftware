import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import type { Sesion } from "../../trpc/context.js";
import { appRouter } from "../../trpc/router.js";
import { crearCliente } from "../clientes/service.js";
import { CONSULTAS_DEL_ASISTENTE, herramientasDeDatos, recortar } from "./herramientas.js";

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

  it("las de administración contestan sin acceso a quien no es administrador", async () => {
    const t = await crearTenantDePrueba();
    const lector = herramientasDeDatos({
      session: sesion(t.tenantId, t.usuarioId),
      headers: new Headers(),
    });
    expect(await usar(lector.historial, {})).toEqual({
      error: "Este usuario no tiene acceso a esa información.",
    });
    expect(await usar(lector.equipo_y_accesos, {})).toEqual({
      error: "Este usuario no tiene acceso a esa información.",
    });
  });

  it("ninguna herramienta usa modo estricto, que no admite filtros opcionales", () => {
    const todas = Object.values(
      herramientasDeDatos({ session: sesion("x", "y"), headers: new Headers() }),
    );
    expect(todas.every((h) => h.strict === false)).toBe(true);
  });
});

/**
 * Las consultas de lectura que el asistente NO usa, cada una con su motivo.
 * Si aparece una consulta nueva en la app, tiene que ir a una de las dos
 * listas: el asistente la usa, o se decide que no.
 */
const EXCLUIDAS: Record<string, string> = {
  "clientes.exportar": "deja una exportación en el historial",
  "proveedores.exportar": "deja una exportación en el historial",
  "stock.exportar": "deja una exportación en el historial",
  "comprobantes.ventas.exportar": "deja una exportación en el historial",
  "comprobantes.compras.exportar": "deja una exportación en el historial",
  "tesoreria.movimientos.exportar": "deja una exportación en el historial",
  "tesoreria.cheques.exportar": "deja una exportación en el historial",
  "impuestos.exportar": "deja una exportación en el historial",
  "auditoria.exportar": "deja una exportación en el historial",
  "clientes.obtener": "buscar_clientes y la ficha traen los mismos datos",
  "proveedores.obtener": "buscar_proveedores y la ficha traen los mismos datos",
  "stock.obtener": "stock trae los mismos datos",
  "tesoreria.cuentas.obtener": "cuentas_y_saldos trae los mismos datos",
  "tesoreria.movimientos.obtener": "el listado trae los mismos datos",
  "tesoreria.cheques.obtener": "el listado trae los mismos datos",
  "impuestos.obtener": "el listado trae los mismos datos",
  "cuentaCorriente.abiertos": "es el armado del formulario de imputación",
  "auditoria.modulos": "es la lista de un filtro de pantalla",
  "consolidado.duracionHoras": "es una constante de pantalla",
  "consolidado.abrir": "es la entrada pública de un link",
  "explicacion.habilitada": "es un interruptor de pantalla",
  "invitaciones.ver": "es la pantalla pública de una invitación",
  "plataforma.organizaciones": "es del panel de plataforma, no de una empresa",
  "plataforma.invitacionesPendientes": "es del panel de plataforma, no de una empresa",
  "plataforma.admins": "es del panel de plataforma, no de una empresa",
};

describe("cobertura del asistente", () => {
  it("toda consulta de la app la usa el asistente o está excluida con su motivo", () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { type: string } }
    >;
    const consultas = Object.entries(procedures)
      .filter(([, p]) => p._def.type === "query")
      .map(([nombre]) => nombre);
    const usadas = new Set<string>(CONSULTAS_DEL_ASISTENTE);

    expect(consultas.filter((c) => !usadas.has(c) && !(c in EXCLUIDAS))).toEqual([]);
    // Y que ninguna de las listas nombre algo que ya no existe.
    expect([...usadas, ...Object.keys(EXCLUIDAS)].filter((c) => !consultas.includes(c))).toEqual(
      [],
    );
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

  it("saca los campos internos, también en los anidados", () => {
    expect(
      recortar({ tenantId: "t", saldo: "1.00", items: [{ id: "a", createdAt: "x", nombre: "A" }] }),
    ).toEqual({ saldo: "1.00", items: [{ id: "a", nombre: "A" }] });
  });

  it("lo chico pasa igual", () => {
    expect(recortar({ a: 1 })).toEqual({ a: 1 });
  });
});
