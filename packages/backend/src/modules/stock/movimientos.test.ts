import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { compraInputSchema } from "../comprobantes/schema.js";
import { crearCompra, crearVenta, transicionarVenta } from "../comprobantes/service.js";
import { crearProveedor } from "../proveedores/service.js";
import { ajustarStock, movimientosDeProducto } from "./movimientos.js";
import { actualizarProducto, crearProducto, obtenerProducto } from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

async function producto(actor: Actor, stock = "10", costo = "100") {
  return crearProducto(actor, {
    sku: `P-${crypto.randomUUID().slice(0, 8)}`,
    descripcion: "Hierro",
    costoUnitario: costo,
    precioVenta: "200",
    moneda: "ARS",
    stockActual: stock,
    stockMinimo: "0",
  });
}

async function stockDe(actor: Actor, id: string) {
  return (await obtenerProducto(actor, id))?.stockActual;
}

async function venta(
  actor: Actor,
  productoId: string,
  cantidad: string,
  clase: "factura" | "nota_credito" = "factura",
) {
  const cliente = await crearCliente(actor, {
    razonSocial: `Cliente ${crypto.randomUUID().slice(0, 6)}`,
    condicionIva: "responsable_inscripto",
  });
  return crearVenta(actor, {
    clase,
    puntoVenta: 1,
    clienteId: cliente.id,
    fechaEmision: "2026-08-01",
    condicionVentaDias: 0,
    moneda: "ARS",
    items: [
      { productoId, descripcion: "Hierro", cantidad, precioUnitario: "200", alicuotaIva: "21" },
    ],
  });
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("movimientos de stock", () => {
  it("el stock con el que nace un producto es un movimiento inicial", async () => {
    const t = await crearTenantDePrueba();
    const p = await producto(t, "10");

    expect(await stockDe(t, p.id)).toBe("10.000");
    const movs = await movimientosDeProducto(t, p.id);
    expect(movs.map((m) => [m.tipo, m.cantidad])).toEqual([["inicial", "10.000"]]);
  });

  it("editar el producto no cambia el stock: se mueve con ajustes", async () => {
    const t = await crearTenantDePrueba();
    const p = await producto(t, "10");
    await actualizarProducto(t, {
      id: p.id,
      datos: {
        sku: p.sku,
        descripcion: "Hierro redondo",
        moneda: "ARS",
        stockActual: "999",
        stockMinimo: "0",
      },
    });
    expect(await stockDe(t, p.id)).toBe("10.000");

    await ajustarStock(t, { productoId: p.id, cantidad: "-3", motivo: "Conteo físico" });
    expect(await stockDe(t, p.id)).toBe("7.000");
  });

  it("una factura descuenta stock al confirmarse, no antes", async () => {
    const t = await crearTenantDePrueba();
    const p = await producto(t, "10");
    const f = await venta(t, p.id, "4");

    await transicionarVenta(t, { id: f.id, evento: "emitir" });
    expect(await stockDe(t, p.id)).toBe("10.000");

    await transicionarVenta(t, { id: f.id, evento: "aprobar" });
    expect(await stockDe(t, p.id)).toBe("6.000");
    // Guarda el costo con el que salió.
    const salida = (await movimientosDeProducto(t, p.id)).find((m) => m.tipo === "venta");
    expect(salida?.costoUnitario).toBe("100.00");
  });

  it("una nota de crédito confirmada devuelve la mercadería", async () => {
    const t = await crearTenantDePrueba();
    const p = await producto(t, "10");
    const nc = await venta(t, p.id, "2", "nota_credito");
    await transicionarVenta(t, { id: nc.id, evento: "emitir" });
    await transicionarVenta(t, { id: nc.id, evento: "aprobar" });

    expect(await stockDe(t, p.id)).toBe("12.000");
  });

  it("una compra con productos suma stock y pondera el costo", async () => {
    const t = await crearTenantDePrueba();
    const p = await producto(t, "10", "100");
    const prov = await crearProveedor(t, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });

    await crearCompra(t, {
      proveedorId: prov.id,
      fechaRecepcion: "2026-08-01",
      condicionPagoDias: 30,
      moneda: "ARS",
      neto: "4200.00",
      iva: "882.00",
      total: "5082.00",
      items: [{ productoId: p.id, descripcion: "Hierro", cantidad: "30", costoUnitario: "140" }],
    });

    const despues = await obtenerProducto(t, p.id);
    expect(despues?.stockActual).toBe("40.000");
    // (10 × 100 + 30 × 140) / 40 = 130
    expect(despues?.costoUnitario).toBe("130.00");
  });

  it("una compra de servicios no lleva productos", () => {
    expect(
      compraInputSchema.safeParse({
        proveedorId: crypto.randomUUID(),
        fechaRecepcion: "2026-08-01",
        total: "100",
        categoriaId: crypto.randomUUID(),
        items: [
          { productoId: crypto.randomUUID(), descripcion: "x", cantidad: "1", costoUnitario: "1" },
        ],
      }).success,
    ).toBe(false);
  });

  it("no ve ni ajusta el stock de otra empresa", async () => {
    const a = await crearTenantDePrueba();
    const b = await crearTenantDePrueba();
    const p = await producto(a, "10");

    expect(await movimientosDeProducto(b, p.id)).toEqual([]);
    await expect(ajustarStock(b, { productoId: p.id, cantidad: "5", motivo: "x" })).rejects.toThrow(
      /Producto no encontrado/,
    );
    expect(await stockDe(a, p.id)).toBe("10.000");
  });
});
