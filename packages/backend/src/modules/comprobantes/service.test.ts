import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearCliente } from "../clientes/service.js";
import { crearProveedor } from "../proveedores/service.js";
import {
  actualizarVenta,
  ComprobanteInmutableError,
  crearCompra,
  crearVenta,
  listarCompras,
  listarVentas,
  obtenerVenta,
  TransicionInvalidaError,
  transicionarVenta,
} from "./service.js";

const tenantA = { tenantId: `test-${randomUUID()}`, usuarioId: "test-user" };
const tenantB = { tenantId: `test-${randomUUID()}`, usuarioId: "test-user" };

afterAll(async () => {
  await pool.end();
});

describe("comprobantes de venta (integración, RLS activo)", () => {
  it("calcula los totales desde los ítems e infiere la letra del cliente", async () => {
    const cliente = await crearCliente(tenantA, {
      razonSocial: "Mayorista RI SA",
      condicionIva: "responsable_inscripto",
    });

    const venta = await crearVenta(tenantA, {
      clase: "factura",
      puntoVenta: 1,
      clienteId: cliente.id,
      fechaEmision: "2026-08-01",
      condicionVentaDias: 30,
      moneda: "ARS",
      items: [
        {
          descripcion: "Servicio de consultoría",
          cantidad: "1",
          precioUnitario: "100000",
          alicuotaIva: "21",
        },
        { descripcion: "Insumos", cantidad: "2", precioUnitario: "25000", alicuotaIva: "10.5" },
      ],
    });

    // Cliente RI → letra A. Neto 150000, IVA 21000 + 5250.
    expect(venta.letra).toBe("A");
    expect(venta.neto).toBe("150000.00");
    expect(venta.iva).toBe("26250.00");
    expect(venta.total).toBe("176250.00");
    expect(venta.estado).toBe("borrador");
  });

  it("un cliente consumidor final recibe letra B", async () => {
    const cliente = await crearCliente(tenantA, {
      razonSocial: "Juan Consumidor",
      condicionIva: "consumidor_final",
    });
    const venta = await crearVenta(tenantA, {
      clase: "factura",
      puntoVenta: 1,
      clienteId: cliente.id,
      fechaEmision: "2026-08-02",
      condicionVentaDias: 0,
      moneda: "ARS",
      items: [
        { descripcion: "Producto", cantidad: "1", precioUnitario: "50000", alicuotaIva: "21" },
      ],
    });
    expect(venta.letra).toBe("B");
  });

  it("expone availableEvents y editable para el frontend", async () => {
    const { items } = await listarVentas(tenantA, { pagina: 1, tamanoPagina: 10 });
    const borrador = items[0];
    expect(borrador?.availableEvents).toEqual(["emitir"]);
    expect(borrador?.editable).toBe(true);
  });

  it("guarda los ítems y los devuelve ordenados", async () => {
    const { items } = await listarVentas(tenantA, { pagina: 1, tamanoPagina: 10 });
    const conItems = await obtenerVenta(tenantA, items.at(-1)?.id ?? "");
    expect(conItems?.items).toHaveLength(2);
    expect(conItems?.items[0]?.orden).toBe(0);
  });

  it("recorre el ciclo de vida borrador → enviada → aprobada", async () => {
    const { items } = await listarVentas(tenantA, { pagina: 1, tamanoPagina: 10 });
    const id = items.at(-1)?.id ?? "";

    const enviada = await transicionarVenta(tenantA, { id, evento: "emitir" });
    expect(enviada?.estado).toBe("enviada");

    const aprobada = await transicionarVenta(tenantA, { id, evento: "aprobar" });
    expect(aprobada?.estado).toBe("aprobada");
  });

  it("rechaza una transición inválida", async () => {
    const { items } = await listarVentas(tenantA, {
      estado: "aprobada",
      pagina: 1,
      tamanoPagina: 10,
    });
    const id = items[0]?.id ?? "";
    await expect(transicionarVenta(tenantA, { id, evento: "emitir" })).rejects.toBeInstanceOf(
      TransicionInvalidaError,
    );
  });

  it("un comprobante fuera de borrador es inmutable", async () => {
    const { items } = await listarVentas(tenantA, {
      estado: "aprobada",
      pagina: 1,
      tamanoPagina: 10,
    });
    const aprobada = items[0];
    await expect(
      actualizarVenta(tenantA, {
        id: aprobada?.id ?? "",
        datos: {
          clase: "factura",
          puntoVenta: 1,
          clienteId: aprobada?.clienteId ?? "",
          fechaEmision: "2026-08-01",
          condicionVentaDias: 0,
          moneda: "ARS",
          items: [
            { descripcion: "Alterado", cantidad: "1", precioUnitario: "1", alicuotaIva: "21" },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ComprobanteInmutableError);
  });

  it("un borrador sí se puede editar y recalcula los totales", async () => {
    const { items } = await listarVentas(tenantA, {
      estado: "borrador",
      pagina: 1,
      tamanoPagina: 10,
    });
    const borrador = items[0];
    const actualizada = await actualizarVenta(tenantA, {
      id: borrador?.id ?? "",
      datos: {
        clase: "factura",
        puntoVenta: 1,
        clienteId: borrador?.clienteId ?? "",
        fechaEmision: "2026-08-02",
        condicionVentaDias: 0,
        moneda: "ARS",
        items: [
          { descripcion: "Producto", cantidad: "2", precioUnitario: "50000", alicuotaIva: "21" },
        ],
      },
    });
    expect(actualizada?.neto).toBe("100000.00");
    expect(actualizada?.total).toBe("121000.00");
  });

  it("el aislamiento RLS impide ver comprobantes de otro tenant", async () => {
    const { total } = await listarVentas(tenantB, { pagina: 1, tamanoPagina: 10 });
    expect(total).toBe(0);
  });
});

describe("comprobantes de compra (integración)", () => {
  it("registra una compra y la lista con el proveedor", async () => {
    const proveedor = await crearProveedor(tenantA, {
      razonSocial: "Importadora Andes SRL",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 60,
    });
    await crearCompra(tenantA, {
      proveedorId: proveedor.id,
      letra: "A",
      numeroCompleto: "0003-00004567",
      fechaRecepcion: "2026-08-01",
      condicionPagoDias: 60,
      moneda: "ARS",
      neto: "200000.00",
      iva: "42000.00",
      total: "242000.00",
    });

    const { items, total } = await listarCompras(tenantA, { pagina: 1, tamanoPagina: 10 });
    expect(total).toBe(1);
    expect(items[0]?.proveedorRazonSocial).toBe("Importadora Andes SRL");
    expect(items[0]?.total).toBe("242000.00");
  });

  it("el aislamiento RLS impide ver compras de otro tenant", async () => {
    const { total } = await listarCompras(tenantB, { pagina: 1, tamanoPagina: 10 });
    expect(total).toBe(0);
  });
});
