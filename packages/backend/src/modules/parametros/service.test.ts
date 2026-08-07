import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { guardarParametros, obtenerParametros, POR_DEFECTO } from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };

beforeAll(async () => {
  tenantA = await crearTenantDePrueba();
  tenantB = await crearTenantDePrueba();
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("parametros service (integración, RLS activo)", () => {
  it("sin configurar devuelve los valores por defecto", async () => {
    expect(await obtenerParametros(tenantA)).toEqual(POR_DEFECTO);
  });

  it("guarda y devuelve lo guardado", async () => {
    const guardado = await guardarParametros(tenantA, {
      umbralMoraDias: 45,
      margenObjetivo: "35.00",
      minimoOperativo: "800000.00",
    });

    expect(guardado.umbralMoraDias).toBe(45);
    // Los decimales viajan como string: nunca se convierten a number.
    expect(guardado.margenObjetivo).toBe("35.00");
    expect(guardado.minimoOperativo).toBe("800000.00");
    expect(await obtenerParametros(tenantA)).toEqual(guardado);
  });

  it("guardar dos veces actualiza la misma fila en lugar de duplicarla", async () => {
    await guardarParametros(tenantA, {
      umbralMoraDias: 30,
      margenObjetivo: null,
      minimoOperativo: "500000.00",
    });

    const leido = await obtenerParametros(tenantA);
    expect(leido.umbralMoraDias).toBe(30);
    expect(leido.margenObjetivo).toBeNull();
    expect(leido.minimoOperativo).toBe("500000.00");
  });

  it("los parámetros de una empresa no afectan a otra", async () => {
    expect(await obtenerParametros(tenantB)).toEqual(POR_DEFECTO);
  });
});
