import { hoyEnArgentina } from "@erp/core/dates";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { crearCompra, crearVenta, transicionarVenta } from "../comprobantes/service.js";
import { resumenFinanciero } from "../financiero/service.js";
import { crearProveedor } from "../proveedores/service.js";
import { crearProducto } from "../stock/service.js";
import { obtenerEstadoResultados, obtenerRentabilidad } from "./service.js";

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("costo de lo vendido", () => {
  it("es el costo de cuando se vendió, no el actual", async () => {
    const t = await crearTenantDePrueba();
    const hoy = hoyEnArgentina();
    const p = await crearProducto(t, {
      sku: "FE-001",
      descripcion: "Hierro",
      costoUnitario: "100",
      precioVenta: "200",
      moneda: "ARS",
      stockActual: "10",
      stockMinimo: "0",
    });
    const cliente = await crearCliente(t, {
      razonSocial: "Cliente",
      condicionIva: "responsable_inscripto",
    });
    const factura = await crearVenta(t, {
      clase: "factura",
      puntoVenta: 1,
      clienteId: cliente.id,
      fechaEmision: hoy,
      condicionVentaDias: 0,
      moneda: "ARS",
      items: [
        {
          productoId: p.id,
          descripcion: "Hierro",
          cantidad: "2",
          precioUnitario: "200",
          alicuotaIva: "21",
        },
      ],
    });
    await transicionarVenta(t, { id: factura.id, evento: "emitir" });
    await transicionarVenta(t, { id: factura.id, evento: "aprobar" });

    // Después de vender, el hierro sube: 8 que quedaban a 100 y entran 8 a
    // 300, así que el costo pasa a 200.
    const prov = await crearProveedor(t, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    await crearCompra(t, {
      proveedorId: prov.id,
      fechaRecepcion: hoy,
      condicionPagoDias: 30,
      moneda: "ARS",
      neto: "2400.00",
      iva: "504.00",
      total: "2904.00",
      items: [{ productoId: p.id, descripcion: "Hierro", cantidad: "8", costoUnitario: "300" }],
    });

    // Lo vendido sigue costando 2 × 100 = 200, aunque hoy el costo sea 200.
    const [mes] = (await obtenerEstadoResultados(t, 1)).slice(-1);
    expect(mes?.costoVentas).toBe("200.00");
    const [fila] = await obtenerRentabilidad(t, { agrupar: "producto", desde: hoy, hasta: hoy });
    expect(fila?.costo).toBe("200.00");
    const margen = (await resumenFinanciero(t)).kpis.find((k) => k.id === "margen");
    expect(margen?.valor).toBe("50.00");
    // Diez pasos contra la base y tres informes pesados: aislado tarda entre
    // medio segundo y casi cinco. Con los tres paquetes corriendo a la vez en
    // `pnpm test`, a veces pasaba los cinco segundos por defecto y la suite
    // daba rojo sin que nada estuviera mal. Un rojo intermitente enseña a
    // ignorar el rojo.
  }, 20_000);
});
