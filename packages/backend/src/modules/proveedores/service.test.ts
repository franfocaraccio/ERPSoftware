import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import {
  actualizarProveedor,
  crearProveedor,
  listarProveedores,
  obtenerProveedor,
} from "./service.js";

/** Fechas relativas a hoy, en el formato YYYY-MM-DD que usan las columnas date. */
function corrido(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const hace = (dias: number) => corrido(-dias);
const enDias = (dias: number) => corrido(dias);

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

describe("proveedores service (integración, RLS activo)", () => {
  it("crea un proveedor con saldo inicial en cero", async () => {
    const creado = await crearProveedor(tenantA, {
      razonSocial: "Insumos del Norte SRL",
      cuit: "30703088534",
      condicionIva: "responsable_inscripto",
      rubro: "Materia prima",
      condicionPagoDias: 30,
    });
    expect(creado.condicionPagoDias).toBe(30);

    const { items, total } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(1);
    expect(items[0]?.saldoAPagar).toBe("0.00");
    expect(items[0]?.proximoVencimiento).toBeNull();
  });

  it("calcula el saldo a pagar como compras menos pagos", async () => {
    const { items } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const proveedorId = items[0]?.id ?? "";

    await withTenant(tenantA.tenantId, async (tx) => {
      await tx.insert(comprobantesCompra).values({
        tenantId: tenantA.tenantId,
        proveedorId,
        fechaRecepcion: "2026-08-01",
        condicionPagoDias: 30,
        total: "121000.00",
      });
      const [cuenta] = await tx
        .insert(cuentas)
        .values({ tenantId: tenantA.tenantId, nombre: "Banco Nación CC", tipo: "cuenta_corriente" })
        .returning();
      await tx.insert(movimientos).values({
        tenantId: tenantA.tenantId,
        fecha: "2026-08-10",
        cuentaId: cuenta?.id ?? "",
        tipo: "egreso",
        medioPago: "transferencia",
        importe: "21000.00",
        proveedorId,
      });
    });

    const { items: conSaldo } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(conSaldo[0]?.saldoAPagar).toBe("100000.00");
    // Recepción 2026-08-01 + 30 días de plazo.
    expect(conSaldo[0]?.proximoVencimiento).toBe("2026-08-31");
  });

  it("los ingresos no descuentan del saldo a pagar", async () => {
    const { items } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const proveedorId = items[0]?.id ?? "";

    await withTenant(tenantA.tenantId, async (tx) => {
      const [cuenta] = await tx.select().from(cuentas).limit(1);
      await tx.insert(movimientos).values({
        tenantId: tenantA.tenantId,
        fecha: "2026-08-11",
        cuentaId: cuenta?.id ?? "",
        tipo: "ingreso",
        medioPago: "transferencia",
        importe: "5000.00",
        proveedorId,
      });
    });

    const { items: despues } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(despues[0]?.saldoAPagar).toBe("100000.00");
  });

  it("el aislamiento RLS impide ver proveedores de otro tenant", async () => {
    const { total } = await listarProveedores(tenantB, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(0);
  });

  it("obtener desde otro tenant devuelve null", async () => {
    const { items } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    expect(await obtenerProveedor(tenantB, items[0]?.id ?? "")).toBeNull();
  });

  it("actualizar desde otro tenant devuelve null", async () => {
    const { items } = await listarProveedores(tenantA, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 1,
    });
    const resultado = await actualizarProveedor(tenantB, {
      id: items[0]?.id ?? "",
      datos: {
        razonSocial: "Hackeado",
        condicionIva: "exento",
        condicionPagoDias: 0,
      },
    });
    expect(resultado).toBeNull();
  });

  it("busca por rubro no; busca por razón social sí", async () => {
    const { total } = await listarProveedores(tenantA, {
      busqueda: "norte",
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(1);
  });

  // Este filtro estaba declarado en el schema y la pantalla lo mandaba, pero la
  // consulta no lo aplicaba: el listado no cambiaba nunca.
  it("filtra por condición de IVA", async () => {
    const tenant = await crearTenantDePrueba();
    await crearProveedor(tenant, {
      razonSocial: "Inscripto SA",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    await crearProveedor(tenant, {
      razonSocial: "Monotributista",
      condicionIva: "monotributo",
      condicionPagoDias: 0,
    });

    const todos = await listarProveedores(tenant, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(todos.total).toBe(2);

    const soloMono = await listarProveedores(tenant, {
      condicionIva: "monotributo",
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(soloMono.total).toBe(1);
    expect(soloMono.items[0]?.razonSocial).toBe("Monotributista");
  });

  it("el próximo vencimiento ignora los que ya vencieron", async () => {
    const tenant = await crearTenantDePrueba();
    const prov = await crearProveedor(tenant, {
      razonSocial: "Con historia",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });

    // Una compra vieja, ya vencida, y una reciente que vence en el futuro.
    await withTenant(tenant.tenantId, async (tx) => {
      await tx.insert(comprobantesCompra).values([
        {
          tenantId: tenant.tenantId,
          proveedorId: prov.id,
          fechaRecepcion: hace(120),
          condicionPagoDias: 30,
          total: "100000.00",
        },
        {
          tenantId: tenant.tenantId,
          proveedorId: prov.id,
          fechaRecepcion: hace(10),
          condicionPagoDias: 30,
          total: "50000.00",
        },
      ]);
    });

    const { items } = await listarProveedores(tenant, {
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    // El mínimo absoluto sería el de hace 90 días; se espera el futuro.
    expect(items[0]?.proximoVencimiento).toBe(enDias(20));
  });

  it("filtra por rango de próximo vencimiento", async () => {
    const tenant = await crearTenantDePrueba();
    const cerca = await crearProveedor(tenant, {
      razonSocial: "Vence pronto",
      condicionIva: "exento",
      condicionPagoDias: 0,
    });
    const lejos = await crearProveedor(tenant, {
      razonSocial: "Vence lejos",
      condicionIva: "exento",
      condicionPagoDias: 0,
    });

    await withTenant(tenant.tenantId, async (tx) => {
      await tx.insert(comprobantesCompra).values([
        {
          tenantId: tenant.tenantId,
          proveedorId: cerca.id,
          fechaRecepcion: hace(0),
          condicionPagoDias: 5,
          total: "1000.00",
        },
        {
          tenantId: tenant.tenantId,
          proveedorId: lejos.id,
          fechaRecepcion: hace(0),
          condicionPagoDias: 90,
          total: "1000.00",
        },
      ]);
    });

    const { items, total } = await listarProveedores(tenant, {
      desde: enDias(1),
      hasta: enDias(30),
      orden: "razonSocial",
      direccion: "asc",
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe("Vence pronto");
  });
});
