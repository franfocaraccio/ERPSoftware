import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearProveedor } from "../proveedores/service.js";
import { actualizarProducto, crearProducto, listarProductos, obtenerProducto } from "./service.js";

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

describe("stock service (integración, RLS activo)", () => {
  it("crea un producto y calcula sus derivados al leer", async () => {
    await crearProducto(tenantA, {
      sku: "SKU-001",
      descripcion: "Tornillo hexagonal 8mm",
      categoria: "Ferretería",
      costoUnitario: "150.00",
      precioVenta: "250.00",
      moneda: "ARS",
      stockActual: "40",
      stockMinimo: "10",
    });

    const { items, valorizacionTotal } = await listarProductos(tenantA, {
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(items[0]?.estado).toBe("ok");
    expect(items[0]?.valorizacion).toBe("6000.00"); // 40 × 150
    expect(items[0]?.margenBruto).toBe("40.00"); // (250 − 150) / 250
    expect(valorizacionTotal).toBe("6000.00");
  });

  it("marca reponer cuando el stock llega al mínimo", async () => {
    await crearProducto(tenantA, {
      sku: "SKU-002",
      descripcion: "Arandela plana",
      moneda: "ARS",
      stockActual: "5",
      stockMinimo: "5",
      costoUnitario: "20.00",
    });

    const { items } = await listarProductos(tenantA, {
      soloReponer: true,
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.sku).toBe("SKU-002");
    expect(items[0]?.estado).toBe("reponer");
  });

  it("el filtro SQL de reposición coincide con el criterio de core", async () => {
    const { items: todos } = await listarProductos(tenantA, {
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 50,
    });
    const { items: filtrados } = await listarProductos(tenantA, {
      soloReponer: true,
      pagina: 1,
      tamanoPagina: 50,
    });
    const esperados = todos.filter((p) => p.estado === "reponer").map((p) => p.sku);
    expect(filtrados.map((p) => p.sku)).toEqual(esperados);
  });

  it("sin costo cargado la valorización es cero y el margen null", async () => {
    await crearProducto(tenantA, {
      sku: "SKU-003",
      descripcion: "Producto sin costear",
      moneda: "ARS",
      stockActual: "100",
      stockMinimo: "0",
    });
    const { items } = await listarProductos(tenantA, {
      busqueda: "SKU-003",
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(items[0]?.valorizacion).toBe("0.00");
    expect(items[0]?.margenBruto).toBeNull();
  });

  it("trae el nombre del proveedor principal", async () => {
    const proveedor = await crearProveedor(tenantA, {
      razonSocial: "Ferretería Central SA",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 15,
    });
    await crearProducto(tenantA, {
      sku: "SKU-004",
      descripcion: "Llave inglesa",
      moneda: "ARS",
      stockActual: "3",
      stockMinimo: "1",
      proveedorPrincipalId: proveedor.id,
    });
    const { items } = await listarProductos(tenantA, {
      busqueda: "SKU-004",
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(items[0]?.proveedorNombre).toBe("Ferretería Central SA");
  });

  it("el aislamiento RLS impide ver productos de otro tenant", async () => {
    const { total } = await listarProductos(tenantB, {
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 20,
    });
    expect(total).toBe(0);
  });

  it("obtener y actualizar desde otro tenant devuelven null", async () => {
    const { items } = await listarProductos(tenantA, {
      soloReponer: false,
      pagina: 1,
      tamanoPagina: 1,
    });
    const id = items[0]?.id ?? "";
    expect(await obtenerProducto(tenantB, id)).toBeNull();
    expect(
      await actualizarProducto(tenantB, {
        id,
        datos: {
          sku: "HACK",
          descripcion: "Hackeado",
          moneda: "ARS",
          stockActual: "0",
          stockMinimo: "0",
        },
      }),
    ).toBeNull();
  });
});
