import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { crearCompra, crearVenta, transicionarVenta } from "../comprobantes/service.js";
import { crearProveedor } from "../proveedores/service.js";
import { agruparPorProveedor, type FilaReposicion, sugerenciasDeCompra } from "./reposicion.js";
import { crearProducto } from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

const HOY = "2026-08-20";

async function producto(actor: Actor, stock: string, minimo: string, proveedorId?: string) {
  return crearProducto(actor, {
    sku: `P-${crypto.randomUUID().slice(0, 8)}`,
    descripcion: "Hierro",
    costoUnitario: "100",
    precioVenta: "200",
    moneda: "ARS",
    stockActual: stock,
    stockMinimo: minimo,
    ...(proveedorId ? { proveedorPrincipalId: proveedorId } : {}),
  });
}

async function vender(actor: Actor, productoId: string, cantidad: string, fecha: string) {
  const cliente = await crearCliente(actor, {
    razonSocial: `Cliente ${crypto.randomUUID().slice(0, 6)}`,
    condicionIva: "responsable_inscripto",
  });
  const f = await crearVenta(actor, {
    clase: "factura",
    puntoVenta: 1,
    clienteId: cliente.id,
    fechaEmision: fecha,
    condicionVentaDias: 0,
    moneda: "ARS",
    items: [
      { productoId, descripcion: "Hierro", cantidad, precioUnitario: "200", alicuotaIva: "21" },
    ],
  });
  await transicionarVenta(actor, { id: f.id, evento: "emitir" });
  await transicionarVenta(actor, { id: f.id, evento: "aprobar" });
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("sugerenciasDeCompra", () => {
  it("sugiere sólo lo que está para reponer, con las ventas de los últimos 30 días", async () => {
    const t = await crearTenantDePrueba();
    const prov = await crearProveedor(t, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    const bajo = await producto(t, "50", "30", prov.id);
    await producto(t, "100", "30"); // sobra: no aparece
    await vender(t, bajo.id, "25", "2026-08-10"); // dentro de los 30 días
    await vender(t, bajo.id, "5", "2026-07-01"); // fuera: no cuenta

    const filas = await sugerenciasDeCompra(t, HOY);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      productoId: bajo.id,
      proveedor: "Aceros",
      stock: "20.000",
      salidas30Dias: "25.000",
      // mínimo 30 + 25 vendidas − 20 en stock
      cantidad: "35",
      costoReposicion: "100.00",
      origenCosto: "promedio",
      importe: "3500.00",
    });
  });

  it("el costo de reposición es el de la última compra, no el promedio", async () => {
    const t = await crearTenantDePrueba();
    const prov = await crearProveedor(t, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    const p = await producto(t, "0", "10", prov.id);
    for (const [fecha, costo] of [
      ["2026-08-01", "120"],
      ["2026-08-05", "150"],
    ] as const) {
      await crearCompra(t, {
        proveedorId: prov.id,
        fechaRecepcion: fecha,
        condicionPagoDias: 30,
        moneda: "ARS",
        neto: "300.00",
        iva: "63.00",
        total: "363.00",
        items: [{ productoId: p.id, descripcion: "Hierro", cantidad: "2", costoUnitario: costo }],
      });
    }

    const [fila] = await sugerenciasDeCompra(t, HOY);

    // Stock 4 contra mínimo 10, sin ventas: repone hasta 20.
    expect(fila).toMatchObject({ cantidad: "16", costoReposicion: "150.00" });
    expect(fila?.origenCosto).toBe("ultima_compra");
    expect(fila?.importe).toBe("2400.00");
  });

  it("no mezcla empresas", async () => {
    const a = await crearTenantDePrueba();
    const b = await crearTenantDePrueba();
    await producto(a, "1", "10");
    expect(await sugerenciasDeCompra(b, HOY)).toEqual([]);
  });
});

describe("agruparPorProveedor", () => {
  const fila = (proveedor: string | null, importe: string | null, moneda: "ARS" | "USD" = "ARS") =>
    ({
      proveedorId: proveedor,
      proveedor,
      importe,
      moneda,
    }) as FilaReposicion;

  it("arma un pedido por proveedor, con su total, y deja los sin proveedor al final", () => {
    const pedidos = agruparPorProveedor([
      fila(null, "10.00"),
      fila("Tornillos", "100.50"),
      fila("Aceros", "200.00"),
      fila("Tornillos", "50.25"),
    ]);
    expect(pedidos.map((p) => [p.proveedor, p.items.length, p.total])).toEqual([
      ["Aceros", 1, "200.00"],
      ["Tornillos", 2, "150.75"],
      [null, 1, "10.00"],
    ]);
  });

  it("sin total si falta un costo o se mezclan monedas", () => {
    expect(agruparPorProveedor([fila("A", "1.00"), fila("A", null)])[0]?.total).toBeNull();
    expect(agruparPorProveedor([fila("A", "1.00"), fila("A", "1.00", "USD")])[0]?.total).toBeNull();
  });
});
