import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../db/client.js";
import { member, user } from "../../db/schema/auth.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import {
  borrarPermisoInvitacion,
  cambiarAccesoPanel,
  esMiembro,
  listarEquipo,
  puedeVerPanel,
  registrarPermisoInvitacion,
  traspasarPermisoDeInvitacion,
} from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };
const usuariosCreados: string[] = [];

/** Un usuario real: `listarEquipo` cruza miembros contra la tabla de usuarios. */
async function crearUsuario(nombre: string) {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: nombre,
    email: `${id}@test.dev`,
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  usuariosCreados.push(id);
  return id;
}

async function agregarMiembro(tenantId: string, usuarioId: string, rol: string) {
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: tenantId,
    userId: usuarioId,
    role: rol,
    createdAt: new Date(),
  });
}

beforeAll(async () => {
  tenantA = await crearTenantDePrueba(await crearUsuario("Ana Administradora"));
  tenantB = await crearTenantDePrueba(await crearUsuario("Beto de la otra empresa"));
  await agregarMiembro(tenantA.tenantId, tenantA.usuarioId, "administrador");
  await agregarMiembro(tenantB.tenantId, tenantB.usuarioId, "administrador");
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  for (const id of usuariosCreados) {
    await db.delete(user).where(eq(user.id, id));
  }
  await pool.end();
});

describe("equipo service (integración, RLS activo)", () => {
  it("sin fila de permiso, el panel se considera habilitado", async () => {
    // Los miembros que ya existían antes de esta función no lo pierden.
    expect(await puedeVerPanel(tenantA.tenantId, tenantA.usuarioId)).toBe(true);
  });

  it("quita y devuelve el acceso al panel de un miembro", async () => {
    const empleado = await crearUsuario("Carlos Operativo");
    await agregarMiembro(tenantA.tenantId, empleado, "escritura_lectura");

    await cambiarAccesoPanel(tenantA, empleado, false);
    expect(await puedeVerPanel(tenantA.tenantId, empleado)).toBe(false);

    await cambiarAccesoPanel(tenantA, empleado, true);
    expect(await puedeVerPanel(tenantA.tenantId, empleado)).toBe(true);
  });

  it("el permiso de una empresa no se filtra a otra", async () => {
    const empleado = await crearUsuario("Dani Compartida");
    await agregarMiembro(tenantA.tenantId, empleado, "escritura_lectura");
    await agregarMiembro(tenantB.tenantId, empleado, "escritura_lectura");

    // La misma persona en dos PyMEs: sin panel en una, con panel en la otra.
    await cambiarAccesoPanel(tenantA, empleado, false);

    expect(await puedeVerPanel(tenantA.tenantId, empleado)).toBe(false);
    expect(await puedeVerPanel(tenantB.tenantId, empleado)).toBe(true);
  });

  it("traspasa a la persona el permiso elegido al invitarla", async () => {
    const invitacionId = randomUUID();
    await registrarPermisoInvitacion(tenantA, invitacionId, false);

    const invitado = await crearUsuario("Eva Recién Llegada");
    await agregarMiembro(tenantA.tenantId, invitado, "escritura_lectura");
    await traspasarPermisoDeInvitacion(tenantA.tenantId, invitacionId, invitado);

    expect(await puedeVerPanel(tenantA.tenantId, invitado)).toBe(false);
  });

  it("no pisa el permiso vigente de quien ya era miembro", async () => {
    const existente = await crearUsuario("Fabi Ya Estaba");
    await agregarMiembro(tenantA.tenantId, existente, "escritura_lectura");
    await cambiarAccesoPanel(tenantA, existente, false);

    // Una segunda invitación a la misma persona, esta vez con panel.
    const invitacionId = randomUUID();
    await registrarPermisoInvitacion(tenantA, invitacionId, true);
    await traspasarPermisoDeInvitacion(tenantA.tenantId, invitacionId, existente);

    expect(await puedeVerPanel(tenantA.tenantId, existente)).toBe(false);
  });

  it("cancelar la invitación borra el permiso reservado", async () => {
    const invitacionId = randomUUID();
    await registrarPermisoInvitacion(tenantA, invitacionId, false);
    await borrarPermisoInvitacion(tenantA.tenantId, invitacionId);

    const invitado = await crearUsuario("Gastón Cancelado");
    await agregarMiembro(tenantA.tenantId, invitado, "escritura_lectura");
    await traspasarPermisoDeInvitacion(tenantA.tenantId, invitacionId, invitado);

    // Sin reserva vigente queda con el valor por defecto.
    expect(await puedeVerPanel(tenantA.tenantId, invitado)).toBe(true);
  });

  it("lista solo a los miembros de la organización activa", async () => {
    const { miembros } = await listarEquipo(tenantA);
    const emails = miembros.map((m) => m.usuarioId);

    expect(emails).toContain(tenantA.usuarioId);
    expect(emails).not.toContain(tenantB.usuarioId);
    expect(miembros.find((m) => m.usuarioId === tenantA.usuarioId)?.esUnoMismo).toBe(true);
  });

  it("reconoce si alguien pertenece o no a la organización", async () => {
    expect(await esMiembro(tenantA.tenantId, tenantA.usuarioId)).toBe(true);
    expect(await esMiembro(tenantA.tenantId, tenantB.usuarioId)).toBe(false);
  });
});
