import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { auditLog } from "../../db/schema/auditoria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { actualizarCliente, crearCliente, listarClientes, obtenerCliente } from "./service.js";

// Cada corrida usa tenants aleatorios: el aislamiento por RLS hace que no
// interfieran con datos existentes ni entre corridas.
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

describe("clientes service (integración, RLS activo)", () => {
  it("crea un cliente y lo devuelve en el listado", async () => {
    const creado = await crearCliente(tenantA, {
      razonSocial: "ACME SA",
      cuit: "33693450239",
      condicionIva: "responsable_inscripto",
      email: "compras@acme.com.ar",
      limiteCredito: "500000.00",
    });
    expect(creado.id).toBeTruthy();
    expect(creado.estado).toBe("activo");

    const { items, total } = await listarClientes(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe("ACME SA");
  });

  it("el aislamiento RLS impide ver clientes de otro tenant", async () => {
    const { items, total } = await listarClientes(tenantB, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });

  it("obtener desde otro tenant devuelve null, no error", async () => {
    const { items } = await listarClientes(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const id = items[0]?.id;
    expect(id).toBeTruthy();
    expect(await obtenerCliente(tenantB, id ?? "")).toBeNull();
  });

  it("busca por razón social", async () => {
    await crearCliente(tenantA, {
      razonSocial: "Distribuidora Sur SRL",
      condicionIva: "monotributo",
    });
    const { items, total } = await listarClientes(tenantA, {
      busqueda: "sur",
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe("Distribuidora Sur SRL");
  });

  it("actualiza un cliente y registra auditoría de antes/después", async () => {
    const { items } = await listarClientes(tenantA, {
      busqueda: "ACME",
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const id = items[0]?.id ?? "";

    const actualizado = await actualizarCliente(tenantA, {
      id,
      datos: {
        razonSocial: "ACME Argentina SA",
        cuit: "33693450239",
        condicionIva: "responsable_inscripto",
        estado: "en_mora",
      },
    });
    expect(actualizado?.razonSocial).toBe("ACME Argentina SA");
    expect(actualizado?.estado).toBe("en_mora");

    const entradas = await withTenant(tenantA.tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.registroId, id)),
    );
    const acciones = entradas.map((e) => e.accion).sort();
    expect(acciones).toEqual(["alta", "modificacion"]);
  });

  it("actualizar un cliente de otro tenant devuelve null", async () => {
    const { items } = await listarClientes(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const id = items[0]?.id ?? "";
    const resultado = await actualizarCliente(tenantB, {
      id,
      datos: { razonSocial: "Hackeado", condicionIva: "exento", estado: "activo" },
    });
    expect(resultado).toBeNull();
  });
});
