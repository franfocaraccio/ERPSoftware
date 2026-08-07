import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { guardarParametros } from "../parametros/service.js";
import { listarAuditoria } from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };

const listar = (actor: { tenantId: string }, extra = {}) =>
  listarAuditoria(actor, { pagina: 1, tamanoPagina: 25, ...extra });

beforeAll(async () => {
  tenantA = await crearTenantDePrueba();
  tenantB = await crearTenantDePrueba();

  await crearCliente(tenantA, {
    razonSocial: "Auditada SA",
    cuit: "33693450239",
    condicionIva: "responsable_inscripto",
  });
  await guardarParametros(tenantA, {
    umbralMoraDias: 40,
    margenObjetivo: "30.00",
    minimoOperativo: null,
  });
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("auditoria service (integración, RLS activo)", () => {
  it("lista las operaciones de la empresa, de la más nueva a la más vieja", async () => {
    const { items, total } = await listar(tenantA);

    expect(total).toBe(2);
    // La última operación fue guardar parámetros.
    expect(items[0]?.tabla).toBe("parametros");
    expect(items[1]?.tabla).toBe("clientes");
    expect(items[0]?.fecha.getTime()).toBeGreaterThanOrEqual(items[1]?.fecha.getTime() ?? 0);
  });

  it("traduce la tabla al módulo que conoce el usuario", async () => {
    const { items } = await listar(tenantA);
    expect(items.map((i) => i.modulo)).toEqual(["parametros", "clientes"]);
  });

  it("guarda el antes y el después del cambio", async () => {
    const { items } = await listar(tenantA, { modulo: "parametros" });
    const detalle = items[0]?.detalle as { antes: unknown; despues: { umbralMoraDias: number } };

    expect(detalle.antes).toBeNull();
    expect(detalle.despues.umbralMoraDias).toBe(40);
  });

  it("filtra por módulo", async () => {
    const { items, total } = await listar(tenantA, { modulo: "clientes" });

    expect(total).toBe(1);
    expect(items[0]?.tabla).toBe("clientes");
  });

  it("el historial de una empresa no se ve desde otra", async () => {
    const { items, total } = await listar(tenantB);

    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });

  it("un rango de fechas que no incluye hoy no devuelve nada", async () => {
    const { total } = await listar(tenantA, { desde: "2020-01-01", hasta: "2020-12-31" });
    expect(total).toBe(0);
  });

  it("el filtro 'hasta' incluye todo el día indicado", async () => {
    // Sin esto, lo cargado hoy a la tarde quedaría afuera de un filtro que
    // termina hoy.
    const hoy = new Date().toISOString().slice(0, 10);
    const { total } = await listar(tenantA, { hasta: hoy });
    expect(total).toBe(2);
  });
});
