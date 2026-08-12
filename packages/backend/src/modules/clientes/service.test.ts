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

/**
 * Los filtros del listado llegaban al service y no se aplicaban a la consulta:
 * la pantalla ofrecía los desplegables de Condición IVA y Estado, y elegir
 * cualquiera devolvía la lista completa igual. No fallaba nada — simplemente
 * mentía. Por eso cada filtro tiene ahora un caso que lo ejerce.
 */
describe("filtros del listado de clientes", () => {
  let tenant: { tenantId: string; usuarioId: string };
  const listar = (extra: Record<string, unknown>) =>
    listarClientes(tenant, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 50,
      ...extra,
    } as never);

  beforeAll(async () => {
    tenant = await crearTenantDePrueba();
    await crearCliente(tenant, {
      razonSocial: "Monotributista SRL",
      condicionIva: "monotributo",
    });
    const inscripto = await crearCliente(tenant, {
      razonSocial: "Inscripto SA",
      condicionIva: "responsable_inscripto",
    });
    await actualizarCliente(tenant, {
      id: inscripto.id,
      datos: {
        razonSocial: "Inscripto SA",
        condicionIva: "responsable_inscripto",
        estado: "en_mora",
      },
    });
  });

  it("filtra por condición de IVA", async () => {
    const { items, total } = await listar({ condicionIva: "monotributo" });

    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe("Monotributista SRL");
  });

  it("filtra por estado", async () => {
    const { items, total } = await listar({ estado: "en_mora" });

    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe("Inscripto SA");
  });

  it("combina los filtros en lugar de quedarse con el último", async () => {
    // Cada uno por separado devuelve una fila, pero juntos no hay ninguno que
    // cumpla las dos cosas. Si las condiciones se pisaran, esto daría 1.
    const { total } = await listar({ condicionIva: "monotributo", estado: "en_mora" });

    expect(total).toBe(0);
  });

  it("combina la búsqueda con los filtros", async () => {
    expect((await listar({ busqueda: "Inscripto" })).total).toBe(1);
    expect((await listar({ busqueda: "Inscripto", condicionIva: "monotributo" })).total).toBe(0);
  });

  it("sin filtros devuelve todo", async () => {
    expect((await listar({})).total).toBe(2);
  });
});
