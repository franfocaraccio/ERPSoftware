import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { crearProveedor } from "../proveedores/service.js";
import { obtenerRentabilidad } from "../resultados/service.js";
import { crearProducto } from "../stock/service.js";
import { crearCompra, crearVenta, transicionarVenta } from "./service.js";
import { totalesDeCompraPorProveedor, totalesDeVentaPorCliente } from "./totales.js";

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

const RANGO = { desde: "2026-08-01", hasta: "2026-08-31" };

describe("totales por contraparte", () => {
  it("lo facturado a cada cliente, con las notas de crédito restando", async () => {
    const t = await crearTenantDePrueba();
    const grande = await crearCliente(t, {
      razonSocial: "Grande SA",
      condicionIva: "responsable_inscripto",
    });
    const chico = await crearCliente(t, {
      razonSocial: "Chico SRL",
      condicionIva: "responsable_inscripto",
    });
    const vender = async (
      clienteId: string,
      precio: string,
      clase: "factura" | "nota_credito" = "factura",
      fecha = "2026-08-10",
    ) => {
      const f = await crearVenta(t, {
        clase,
        puntoVenta: 1,
        clienteId,
        fechaEmision: fecha,
        condicionVentaDias: 0,
        moneda: "ARS",
        items: [
          { descripcion: "Servicio", cantidad: "1", precioUnitario: precio, alicuotaIva: "21" },
        ],
      });
      await transicionarVenta(t, { id: f.id, evento: "emitir" });
    };
    await vender(grande.id, "1000");
    await vender(grande.id, "200", "nota_credito");
    await vender(chico.id, "100");
    await vender(chico.id, "5000", "factura", "2026-09-01"); // fuera del rango

    const totales = await totalesDeVentaPorCliente(t, RANGO);

    expect(totales.map((f) => [f.nombre, f.comprobantes, f.neto, f.iva, f.total])).toEqual([
      ["Grande SA", 2, "800.00", "168.00", "968.00"],
      ["Chico SRL", 1, "100.00", "21.00", "121.00"],
    ]);
  });

  it("lo comprado a cada proveedor", async () => {
    const t = await crearTenantDePrueba();
    const prov = await crearProveedor(t, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    for (const neto of ["1000.00", "500.00"]) {
      await crearCompra(t, {
        proveedorId: prov.id,
        fechaRecepcion: "2026-08-05",
        condicionPagoDias: 30,
        moneda: "ARS",
        neto,
        iva: neto === "1000.00" ? "210.00" : "105.00",
        total: neto === "1000.00" ? "1210.00" : "605.00",
      });
    }

    const [fila] = await totalesDeCompraPorProveedor(t, RANGO);

    expect(fila).toMatchObject({
      nombre: "Aceros",
      comprobantes: 2,
      neto: "1500.00",
      total: "1815.00",
    });
  });
});

describe("rentabilidad filtrada", () => {
  it("por cliente (qué le vendo) y por producto (quién lo compra)", async () => {
    const t = await crearTenantDePrueba();
    const producto = async (sku: string) =>
      crearProducto(t, {
        sku,
        descripcion: sku,
        costoUnitario: "50",
        precioVenta: "100",
        moneda: "ARS",
        stockActual: "100",
        stockMinimo: "0",
      });
    const hierro = await producto("Hierro");
    const pintura = await producto("Pintura");
    const a = await crearCliente(t, { razonSocial: "A", condicionIva: "responsable_inscripto" });
    const b = await crearCliente(t, { razonSocial: "B", condicionIva: "responsable_inscripto" });
    const vender = async (clienteId: string, productoId: string) => {
      const f = await crearVenta(t, {
        clase: "factura",
        puntoVenta: 1,
        clienteId,
        fechaEmision: "2026-08-10",
        condicionVentaDias: 0,
        moneda: "ARS",
        items: [
          { productoId, descripcion: "x", cantidad: "1", precioUnitario: "100", alicuotaIva: "21" },
        ],
      });
      await transicionarVenta(t, { id: f.id, evento: "emitir" });
    };
    await vender(a.id, hierro.id);
    await vender(a.id, pintura.id);
    await vender(b.id, hierro.id);

    const deA = await obtenerRentabilidad(t, { agrupar: "producto", ...RANGO, clienteId: a.id });
    expect(deA.map((r) => r.clave).sort()).toEqual(["Hierro", "Pintura"]);

    const delHierro = await obtenerRentabilidad(t, {
      agrupar: "cliente",
      ...RANGO,
      productoId: hierro.id,
    });
    expect(delHierro.map((r) => r.clave).sort()).toEqual(["A", "B"]);

    const pinturaDeB = await obtenerRentabilidad(t, {
      agrupar: "producto",
      ...RANGO,
      clienteId: b.id,
      productoId: pintura.id,
    });
    expect(pinturaDeB).toEqual([]);
  });
});
