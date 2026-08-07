import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { accesosConsolidado } from "../../db/schema/accesos.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearAcceso, listarAccesos, revocarAcceso, validarToken } from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };

/** El token no se devuelve en el listado: se saca del link para los tests. */
const tokenDe = (link: string) => link.split("/").pop() ?? "";

beforeAll(async () => {
  tenantA = await crearTenantDePrueba();
  tenantB = await crearTenantDePrueba();
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("consolidado service (integración, RLS activo)", () => {
  it("genera un acceso que vence en 48 horas", async () => {
    const antes = Date.now();
    const acceso = await crearAcceso(tenantA, "Contador");

    const horas = (acceso.expira.getTime() - antes) / (60 * 60 * 1000);
    expect(horas).toBeGreaterThan(47.9);
    expect(horas).toBeLessThan(48.1);
    expect(acceso.vencido).toBe(false);
    expect(acceso.link).toContain(tenantA.tenantId);
  });

  it("el token sirve más de una vez", async () => {
    // Es la diferencia con un magic link clásico: no se quema en el primer uso.
    const acceso = await crearAcceso(tenantA, "Banco");
    const token = tokenDe(acceso.link);

    expect(await validarToken(tenantA.tenantId, token)).not.toBeNull();
    expect(await validarToken(tenantA.tenantId, token)).not.toBeNull();
    expect(await validarToken(tenantA.tenantId, token)).not.toBeNull();
  });

  it("registra el último uso", async () => {
    const acceso = await crearAcceso(tenantA, "Con seguimiento");
    await validarToken(tenantA.tenantId, tokenDe(acceso.link));

    const [enLista] = (await listarAccesos(tenantA)).filter((a) => a.id === acceso.id);
    expect(enLista?.ultimoUso).not.toBeNull();
  });

  it("un acceso revocado deja de servir y desaparece del listado", async () => {
    const acceso = await crearAcceso(tenantA, "Para revocar");
    const token = tokenDe(acceso.link);

    expect(await revocarAcceso(tenantA, acceso.id)).toBe(true);
    expect(await validarToken(tenantA.tenantId, token)).toBeNull();
    expect((await listarAccesos(tenantA)).map((a) => a.id)).not.toContain(acceso.id);
  });

  it("revocar dos veces no rompe ni miente", async () => {
    const acceso = await crearAcceso(tenantA, "Doble revocación");
    expect(await revocarAcceso(tenantA, acceso.id)).toBe(true);
    expect(await revocarAcceso(tenantA, acceso.id)).toBe(false);
  });

  it("un acceso vencido no sirve, pero se sigue viendo como vencido", async () => {
    const acceso = await crearAcceso(tenantA, "Vencido");
    const token = tokenDe(acceso.link);

    await withTenant(tenantA.tenantId, async (tx) => {
      await tx
        .update(accesosConsolidado)
        .set({ expira: new Date(Date.now() - 1000) })
        .where(eq(accesosConsolidado.id, acceso.id));
    });

    expect(await validarToken(tenantA.tenantId, token)).toBeNull();
    const [enLista] = (await listarAccesos(tenantA)).filter((a) => a.id === acceso.id);
    expect(enLista?.vencido).toBe(true);
  });

  it("el token de una empresa no abre la de otra", async () => {
    const acceso = await crearAcceso(tenantA, "De la empresa A");
    const token = tokenDe(acceso.link);

    expect(await validarToken(tenantB.tenantId, token)).toBeNull();
    expect(await validarToken(tenantA.tenantId, token)).not.toBeNull();
  });

  it("un token inventado no abre nada", async () => {
    expect(await validarToken(tenantA.tenantId, "a".repeat(64))).toBeNull();
  });

  it("los accesos de una empresa no se ven desde otra", async () => {
    await crearAcceso(tenantB, "Solo de B");
    const deA = await listarAccesos(tenantA);
    expect(deA.map((a) => a.descripcion)).not.toContain("Solo de B");
  });
});
