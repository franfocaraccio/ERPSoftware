import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { productos } from "../../db/schema/stock.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { resumenFinanciero } from "../financiero/service.js";
import { crearImpuesto } from "../impuestos/service.js";
import { movimientoInputSchema } from "../tesoreria/schema.js";
import { crearCuenta, crearMovimiento } from "../tesoreria/service.js";

// El panel trae la cotización del dólar de Ámbito. Los tests no salen a
// internet: una cotización fija.
vi.mock("../cotizaciones/dolar.js", () => ({
  cotizacionesDolar: async () => ({
    oficial: {
      compra: "1000.00",
      venta: "1050.00",
      fecha: "2026-10-09",
      variacion: "0.00",
      tendencia: "igual",
    },
    blue: null,
  }),
}));

import {
  crearCategoria,
  crearGastoRecurrente,
  listarCategorias,
  obtenerEstadoResultados,
  obtenerRentabilidad,
} from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const mesActual = () => hoy().slice(0, 7);

async function categoria(actor: Actor, nombre: string): Promise<string> {
  const c = (await listarCategorias(actor)).find((x) => x.nombre === nombre);
  if (!c) {
    throw new Error(`No existe la categoría ${nombre}`);
  }
  return c.id;
}

/**
 * Un mes completo: una venta de 1000 netos con un producto de costo 600, una
 * compra de fletes (gasto), una compra de mercadería (no gasto), un sueldo,
 * un pago a proveedor (no gasto), IIBB y un interés ganado.
 */
async function mesDePrueba() {
  const actor = await crearTenantDePrueba();
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
  });
  const cuenta = await crearCuenta(actor, {
    nombre: "Banco",
    tipo: "cuenta_corriente",
    moneda: "ARS",
  });
  const fletes = await categoria(actor, "Fletes");
  const sueldos = await categoria(actor, "Sueldos y cargas sociales");
  const intereses = await categoria(actor, "Intereses ganados");

  const proveedorId = await withTenant(actor.tenantId, async (tx) => {
    const [proveedor] = await tx
      .insert(proveedores)
      .values({
        tenantId: actor.tenantId,
        razonSocial: "Prov",
        condicionIva: "responsable_inscripto",
      })
      .returning();
    const [producto] = await tx
      .insert(productos)
      .values({
        tenantId: actor.tenantId,
        sku: "P1",
        descripcion: "Producto 1",
        categoria: "Hierro",
        costoUnitario: "60",
      })
      .returning();
    const [venta] = await tx
      .insert(comprobantesVenta)
      .values({
        tenantId: actor.tenantId,
        clienteId: cliente.id,
        letra: "A",
        puntoVenta: 1,
        fechaEmision: hoy(),
        condicionIvaReceptor: "responsable_inscripto",
        estado: "enviada",
        neto: "1000.00",
        iva: "210.00",
        total: "1210.00",
      })
      .returning();
    await tx.insert(itemsComprobanteVenta).values({
      tenantId: actor.tenantId,
      comprobanteId: venta?.id ?? "",
      productoId: producto?.id ?? null,
      descripcion: "Producto 1",
      cantidad: "10",
      precioUnitario: "100",
      alicuotaIva: "21",
    });
    await tx.insert(comprobantesCompra).values([
      // Fletes: gasto.
      {
        tenantId: actor.tenantId,
        proveedorId: proveedor?.id ?? "",
        fechaRecepcion: hoy(),
        neto: "50.00",
        iva: "10.50",
        total: "60.50",
        categoriaId: fletes,
      },
      // Mercadería: va a stock, no es gasto.
      {
        tenantId: actor.tenantId,
        proveedorId: proveedor?.id ?? "",
        fechaRecepcion: hoy(),
        neto: "500.00",
        iva: "105.00",
        total: "605.00",
      },
    ]);
    return proveedor?.id ?? "";
  });

  const mov = (tipo: "ingreso" | "egreso", importe: string, extra: Record<string, unknown>) =>
    crearMovimiento(actor, {
      fecha: hoy(),
      cuentaId: cuenta.id,
      tipo,
      medioPago: "transferencia",
      importe,
      conciliado: false,
      ...extra,
    });
  await mov("egreso", "200.00", { categoriaId: sueldos });
  // Paga la mercadería: cancela una deuda, no es otro gasto.
  await mov("egreso", "605.00", { proveedorId });
  await mov("ingreso", "10.00", { categoriaId: intereses });

  await crearImpuesto(actor, {
    tipo: "iibb",
    periodo: mesActual(),
    baseImponible: "1000.00",
    alicuota: "3.5",
    importePagado: "0",
    fechaVencimiento: "2099-01-15",
  });

  return { actor, cuentaId: cuenta.id, sueldos };
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("categorías", () => {
  it("cada empresa arranca con la lista inicial, una sola vez", async () => {
    const t = await crearTenantDePrueba();
    const primera = await listarCategorias(t);
    const segunda = await listarCategorias(t);
    expect(primera.length).toBeGreaterThan(5);
    expect(segunda.length).toBe(primera.length);
  });

  it("no acepta dos categorías del mismo tipo con el mismo nombre", async () => {
    const t = await crearTenantDePrueba();
    await crearCategoria(t, { nombre: "Seguros", tipo: "gasto", activa: true });
    await expect(
      crearCategoria(t, { nombre: "Seguros", tipo: "gasto", activa: true }),
    ).rejects.toThrow();
  });
});

describe("estado de resultados", () => {
  it("cada peso entra una sola vez", async () => {
    const { actor } = await mesDePrueba();
    const mes = (await obtenerEstadoResultados(actor, 1))[0];

    expect(mes?.ventas).toBe("1000.00");
    expect(mes?.costoVentas).toBe("600.00");
    expect(mes?.margenBruto).toBe("400.00");
    // Fletes 50 + Sueldos 200. Ni la mercadería ni el pago al proveedor.
    expect(mes?.gastos).toEqual([
      { categoria: "Sueldos y cargas sociales", importe: "200.00" },
      { categoria: "Fletes", importe: "50.00" },
    ]);
    expect(mes?.impuestosSobreVentas).toBe("35.00");
    // 400 − 250 − 35
    expect(mes?.resultadoOperativo).toBe("115.00");
    expect(mes?.resultadoNeto).toBe("125.00");
  });

  it("muestra los meses pedidos aunque no tengan movimientos", async () => {
    const t = await crearTenantDePrueba();
    const meses = await obtenerEstadoResultados(t, 3);
    expect(meses).toHaveLength(3);
    expect(meses.at(-1)?.periodo).toBe(mesActual());
    expect(meses.every((m) => m.resultadoNeto === "0.00")).toBe(true);
  });

  it("un cobro o pago a una contraparte no lleva categoría", () => {
    expect(
      movimientoInputSchema.safeParse({
        fecha: hoy(),
        cuentaId: crypto.randomUUID(),
        tipo: "egreso",
        medioPago: "transferencia",
        importe: "1.00",
        proveedorId: crypto.randomUUID(),
        categoriaId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});

describe("rentabilidad", () => {
  it("por cliente, producto y categoría de producto", async () => {
    const { actor } = await mesDePrueba();
    const rango = { desde: `${mesActual()}-01`, hasta: hoy() };

    const porCliente = await obtenerRentabilidad(actor, { ...rango, agrupar: "cliente" });
    expect(porCliente[0]).toMatchObject({
      clave: "Cliente SA",
      margen: "400.00",
      margenPorcentual: "40.00",
    });

    const porCategoria = await obtenerRentabilidad(actor, { ...rango, agrupar: "categoria" });
    expect(porCategoria[0]?.clave).toBe("Hierro");
    expect(porCategoria[0]?.incluyeTextoLibre).toBe(false);
  });
});

describe("gastos recurrentes", () => {
  it("se proyectan en la caja, sin crear movimientos", async () => {
    const { actor, cuentaId, sueldos } = await mesDePrueba();
    const antes = await resumenFinanciero(actor);
    await crearGastoRecurrente(actor, {
      descripcion: "Sueldos",
      categoriaId: sueldos,
      cuentaId,
      importe: "1000.00",
      diaDelMes: 10,
      desde: "2020-01-01",
      hasta: null,
      activo: true,
    });
    const despues = await resumenFinanciero(actor);
    const total = (r: typeof antes) =>
      r.proyeccion.reduce((s, f) => s + Math.round(Number(f.pagos) * 100), 0);

    // Trece semanas tienen tres o cuatro días 10.
    const extra = total(despues) - total(antes);
    expect([300000, 400000]).toContain(extra);
  });
});
