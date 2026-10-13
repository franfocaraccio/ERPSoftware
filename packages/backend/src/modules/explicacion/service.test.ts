import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { crearCompra, crearVenta, transicionarVenta } from "../comprobantes/service.js";
import { crearProveedor } from "../proveedores/service.js";
import { crearProducto } from "../stock/service.js";
import { formatearPesos } from "./hechos.js";
import { explicarMes, limpiarCacheExplicaciones } from "./service.js";

// El panel trae la cotización del dólar: los tests no salen a internet.
vi.mock("../cotizaciones/dolar.js", () => ({
  cotizacionesDolar: async () => ({ oficial: null, blue: null }),
}));

type Actor = { tenantId: string; usuarioId: string };

/** El día 10 de hace N meses. */
function haceMeses(n: number): string {
  const d = new Date();
  d.setDate(10);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-10`;
}

async function dosMesesDeVentas(): Promise<Actor> {
  const actor = await crearTenantDePrueba();
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
  });
  await withTenant(actor.tenantId, (tx) =>
    tx.insert(comprobantesVenta).values(
      [
        { fecha: haceMeses(2), neto: "1000.00" },
        { fecha: haceMeses(1), neto: "1100.00" },
      ].map((v) => ({
        tenantId: actor.tenantId,
        clienteId: cliente.id,
        letra: "A" as const,
        puntoVenta: 1,
        fechaEmision: v.fecha,
        condicionIvaReceptor: "responsable_inscripto" as const,
        estado: "enviada" as const,
        neto: v.neto,
        total: v.neto,
      })),
    ),
  );
  return actor;
}

beforeEach(() => limpiarCacheExplicaciones());

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("formatearPesos", () => {
  it("formatea sin pasar por number", () => {
    expect(formatearPesos("1234567.80")).toBe("$ 1.234.567,80");
    expect(formatearPesos("-50.00")).toBe("−$ 50,00");
  });
});

describe("explicación del mes", () => {
  it("el modelo recibe hechos ya calculados, no datos crudos", async () => {
    const actor = await dosMesesDeVentas();
    const redactar = vi.fn(
      async (_instrucciones: string, _prompt: string) =>
        "Las ventas subieron un 10 % contra el mes anterior.",
    );

    const e = await explicarMes(actor, redactar);

    const prompt = redactar.mock.calls[0]?.[1] ?? "";
    // La variación la calculó core, no el modelo.
    expect(prompt).toContain("Ventas netas: $ 1.100,00");
    expect(prompt).toContain("(+10,00 %)");
    expect(e.texto).toContain("10 %");
    expect(e.hechos.length).toBeGreaterThan(0);
  });

  it("le muestra al modelo que un margen cayó porque subió el costo", async () => {
    // El mes pasado el hierro se vendió a costo 100; después subió y este
    // mes salió a 150, al mismo precio. El hecho tiene que decirlo.
    const actor = await crearTenantDePrueba();
    const cliente = await crearCliente(actor, {
      razonSocial: "Cliente SA",
      condicionIva: "responsable_inscripto",
    });
    const hierro = await crearProducto(actor, {
      sku: "FE-001",
      descripcion: "Hierro",
      costoUnitario: "100",
      precioVenta: "200",
      moneda: "ARS",
      stockActual: "100",
      stockMinimo: "0",
    });
    const vender = async (fecha: string) => {
      const f = await crearVenta(actor, {
        clase: "factura",
        puntoVenta: 1,
        clienteId: cliente.id,
        fechaEmision: fecha,
        condicionVentaDias: 0,
        moneda: "ARS",
        items: [
          {
            productoId: hierro.id,
            descripcion: "Hierro",
            cantidad: "10",
            precioUnitario: "200",
            alicuotaIva: "21",
          },
        ],
      });
      await transicionarVenta(actor, { id: f.id, evento: "emitir" });
      await transicionarVenta(actor, { id: f.id, evento: "aprobar" });
    };
    await vender(haceMeses(2));
    // 90 en stock a 100 y entran 90 a 200: el costo pasa a 150.
    const prov = await crearProveedor(actor, {
      razonSocial: "Aceros",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });
    await crearCompra(actor, {
      proveedorId: prov.id,
      fechaRecepcion: haceMeses(1),
      condicionPagoDias: 30,
      moneda: "ARS",
      neto: "18000.00",
      iva: "3780.00",
      total: "21780.00",
      items: [
        { productoId: hierro.id, descripcion: "Hierro", cantidad: "90", costoUnitario: "200" },
      ],
    });
    await vender(haceMeses(1));

    const redactar = vi.fn(async () => "El margen cayó porque subió el costo del hierro.");
    await explicarMes(actor, redactar);

    const prompt = (redactar.mock.calls[0] as unknown as [string, string])[1];
    expect(prompt).toContain(
      "Producto Hierro: margen 25,00 % contra 50,00 %; costo unitario promedio $ 150,00 contra $ 100,00 (+50,00 %); precio unitario promedio $ 200,00 contra $ 200,00 (+0,00 %).",
    );
  });

  it("una respuesta inválida del modelo no se muestra", async () => {
    const actor = await dosMesesDeVentas();
    await expect(explicarMes(actor, async () => "ok")).rejects.toThrow(/no devolvió/);
  });

  it("una explicación por empresa y por día: no se paga dos veces", async () => {
    const actor = await dosMesesDeVentas();
    const redactar = vi.fn(
      async (_instrucciones: string, _prompt: string) =>
        "Las ventas subieron un 10 % contra el mes anterior.",
    );
    await explicarMes(actor, redactar);
    await explicarMes(actor, redactar);
    expect(redactar).toHaveBeenCalledTimes(1);
  });
});
