import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { impuestos } from "../../db/schema/impuestos.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { guardarParametros } from "../parametros/service.js";
import { impuestoInputSchema } from "./schema.js";
import {
  actualizarImpuesto,
  crearImpuesto,
  crearRetencion,
  listarImpuestos,
  obtenerImpuesto,
} from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

const LISTAR = {
  soloImpagos: false,
  campoFecha: "fechaVencimiento",
  orden: "fechaVencimiento",
  direccion: "desc",
  pagina: 1,
  tamanoPagina: 50,
} as const;

const listar = (actor: Actor, extra: Record<string, unknown> = {}) =>
  listarImpuestos(actor, { ...LISTAR, ...extra } as never);

/** `YYYY-MM` de hace N meses, en hora local. */
function mesAtras(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Una venta y una compra en el mes dado, con su IVA. */
async function comprobantesConIva(actor: Actor, mes: string, ivaVenta: string, ivaCompra: string) {
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente IVA",
    condicionIva: "responsable_inscripto",
  });
  await withTenant(actor.tenantId, async (tx) => {
    const [proveedor] = await tx
      .insert(proveedores)
      .values({
        tenantId: actor.tenantId,
        razonSocial: "Proveedor IVA",
        condicionIva: "responsable_inscripto",
      })
      .returning();
    await tx.insert(comprobantesVenta).values({
      tenantId: actor.tenantId,
      clienteId: cliente.id,
      letra: "A",
      puntoVenta: 1,
      fechaEmision: `${mes}-10`,
      condicionIvaReceptor: "responsable_inscripto",
      estado: "enviada",
      iva: ivaVenta,
      total: ivaVenta,
    });
    if (ivaCompra !== "0") {
      await tx.insert(comprobantesCompra).values({
        tenantId: actor.tenantId,
        proveedorId: proveedor?.id ?? "",
        fechaRecepcion: `${mes}-12`,
        iva: ivaCompra,
        total: ivaCompra,
      });
    }
  });
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("obligaciones cargadas a mano", () => {
  it("IIBB: base por alícuota, vencido si la fecha pasó y no está pago", async () => {
    const t = await crearTenantDePrueba();
    await crearImpuesto(t, {
      tipo: "iibb",
      periodo: "2020-01",
      baseImponible: "50000.00",
      alicuota: "3.5",
      importePagado: "0",
      fechaVencimiento: "2020-02-15",
    });

    const { items, cantidadVencidos } = await listar(t);
    expect(items[0]?.importeDeterminado).toBe("1750.00");
    expect(items[0]?.estado).toBe("vencido");
    expect(cantidadVencidos).toBe(1);
    // El período se normaliza al primer día del mes.
    expect(items[0]?.periodo).toBe("2020-01-01");
  });

  it("un pago parcial deja saldo; uno total marca pagado aunque haya vencido", async () => {
    const t = await crearTenantDePrueba();
    await crearImpuesto(t, {
      tipo: "iibb",
      periodo: "2020-01",
      baseImponible: "100000.00",
      alicuota: "3",
      importePagado: "1000.00",
      fechaVencimiento: "2099-02-15",
    });
    await crearImpuesto(t, {
      tipo: "otros",
      periodo: "2020-01",
      importeFijo: "500.00",
      importePagado: "500.00",
      fechaVencimiento: "2020-02-15",
    });

    const { items, totalAdeudado } = await listar(t);
    const parcial = items.find((i) => i.tipo === "iibb");
    expect(parcial?.saldo).toBe("2000.00");
    expect(parcial?.estado).toBe("pendiente");
    expect(items.find((i) => i.tipo === "otros")?.estado).toBe("pagado");
    expect(totalAdeudado).toBe("2000.00");
  });

  it("Ganancias se carga por importe: un anticipo es lo que informa ARCA", async () => {
    const t = await crearTenantDePrueba();
    await crearImpuesto(t, {
      tipo: "ganancias",
      periodo: "2026-08",
      concepto: "Anticipo 3",
      importeFijo: "85000.00",
      importePagado: "0",
      fechaVencimiento: "2099-08-15",
    });

    const [anticipo] = (await listar(t)).items;
    expect(anticipo?.importeDeterminado).toBe("85000.00");
    expect(anticipo?.concepto).toBe("Anticipo 3");
  });

  it("Ganancias sin importe, o un IVA con base, no pasan la validación", () => {
    const base = { periodo: "2026-08", importePagado: "0", fechaVencimiento: "2026-09-15" };
    expect(
      impuestoInputSchema.safeParse({
        ...base,
        tipo: "ganancias",
        baseImponible: "1",
        alicuota: "35",
      }).success,
    ).toBe(false);
    expect(
      impuestoInputSchema.safeParse({ ...base, tipo: "iva", baseImponible: "1", alicuota: "21" })
        .success,
    ).toBe(false);
  });
});

describe("IIBB neto de retenciones", () => {
  it("las retenciones, percepciones y SIRCREB del período restan", async () => {
    const t = await crearTenantDePrueba();
    await crearImpuesto(t, {
      tipo: "iibb",
      periodo: "2026-08",
      baseImponible: "100000.00",
      alicuota: "3.5",
      importePagado: "0",
      fechaVencimiento: "2099-09-15",
    });
    await crearRetencion(t, {
      fecha: "2026-08-05",
      periodo: "2026-08",
      tipo: "percepcion",
      importe: "1000.00",
    });
    await crearRetencion(t, {
      fecha: "2026-08-20",
      periodo: "2026-08",
      tipo: "sircreb",
      importe: "500.00",
    });

    const [iibb] = (await listar(t)).items;
    expect(iibb?.bruto).toBe("3500.00");
    expect(iibb?.creditos).toBe("1500.00");
    expect(iibb?.importeDeterminado).toBe("2000.00");
  });

  it("si las retenciones superan el impuesto, el saldo a favor pasa al mes siguiente", async () => {
    const t = await crearTenantDePrueba();
    for (const periodo of ["2026-07", "2026-08"]) {
      await crearImpuesto(t, {
        tipo: "iibb",
        periodo,
        baseImponible: "100000.00",
        alicuota: "3",
        importePagado: "0",
        fechaVencimiento: `${periodo === "2026-07" ? "2099-08" : "2099-09"}-15`,
      });
    }
    // Julio: 3000 de impuesto y 4000 retenidos → 1000 a favor para agosto.
    await crearRetencion(t, {
      fecha: "2026-07-10",
      periodo: "2026-07",
      tipo: "retencion",
      importe: "4000.00",
    });

    const items = (await listar(t, { orden: "periodo", direccion: "asc" })).items;
    expect(items.map((i) => [i.periodo, i.importeDeterminado])).toEqual([
      ["2026-07-01", "0.00"],
      ["2026-08-01", "2000.00"],
    ]);
  });
});

describe("IVA calculado", () => {
  it("es el débito de las ventas menos el crédito de las compras del mes", async () => {
    const t = await crearTenantDePrueba();
    const mes = mesAtras(1);
    await comprobantesConIva(t, mes, "210.00", "84.00");

    const iva = (await listar(t, { tipo: "iva" })).items;
    expect(iva).toHaveLength(1);
    expect(iva[0]?.origen).toBe("calculado");
    expect(iva[0]?.bruto).toBe("210.00");
    expect(iva[0]?.importeDeterminado).toBe("126.00");
    // Vence el día 20 del mes siguiente (el valor por defecto de Parámetros).
    expect(iva[0]?.fechaVencimiento).toBe(`${mesAtras(0)}-20`);
  });

  it("registrar el pago del período lo marca pagado, sin cargar lo determinado", async () => {
    const t = await crearTenantDePrueba();
    const mes = mesAtras(1);
    await comprobantesConIva(t, mes, "210.00", "0");
    await crearImpuesto(t, {
      tipo: "iva",
      periodo: mes,
      importePagado: "210.00",
      fechaVencimiento: `${mesAtras(0)}-18`,
    });

    const [iva] = (await listar(t, { tipo: "iva" })).items;
    expect(iva?.estado).toBe("pagado");
    expect(iva?.fechaVencimiento).toBe(`${mesAtras(0)}-18`);
  });

  it("un IVA cargado a mano antes queda como histórico y no se calcula encima", async () => {
    const t = await crearTenantDePrueba();
    const mes = mesAtras(1);
    await comprobantesConIva(t, mes, "210.00", "0");
    await withTenant(t.tenantId, (tx) =>
      tx.insert(impuestos).values({
        tenantId: t.tenantId,
        tipo: "iva",
        periodo: `${mes}-01`,
        baseImponible: "1000.00",
        alicuota: "21",
        importePagado: "0",
        fechaVencimiento: "2099-01-20",
      }),
    );

    const iva = (await listar(t, { tipo: "iva" })).items;
    expect(iva.map((i) => [i.origen, i.importeDeterminado])).toEqual([["historico", "210.00"]]);
  });

  it("un monotributista no tiene IVA calculado", async () => {
    const t = await crearTenantDePrueba();
    await guardarParametros(t, {
      umbralMoraDias: 60,
      margenObjetivo: null,
      minimoOperativo: null,
      umbralConcentracion: "20.00",
      regimenFiscal: "monotributo",
    });
    await comprobantesConIva(t, mesAtras(1), "210.00", "0");

    expect((await listar(t, { tipo: "iva" })).items).toEqual([]);
  });
});

describe("régimen fiscal", () => {
  it("un Responsable Inscripto no carga monotributo", async () => {
    const t = await crearTenantDePrueba();
    await expect(
      crearImpuesto(t, {
        tipo: "monotributo",
        periodo: "2026-08",
        importeFijo: "30000.00",
        importePagado: "0",
        fechaVencimiento: "2026-09-20",
      }),
    ).rejects.toThrow(/Responsable Inscripto/);
  });

  it("un monotributista carga su cuota y no Ganancias", async () => {
    const t = await crearTenantDePrueba();
    await guardarParametros(t, {
      umbralMoraDias: 60,
      margenObjetivo: null,
      minimoOperativo: null,
      umbralConcentracion: "20.00",
      regimenFiscal: "monotributo",
    });
    await crearImpuesto(t, {
      tipo: "monotributo",
      periodo: "2026-08",
      importeFijo: "30000.00",
      importePagado: "0",
      fechaVencimiento: "2099-09-20",
    });
    await expect(
      crearImpuesto(t, {
        tipo: "ganancias",
        periodo: "2026-08",
        importeFijo: "1.00",
        importePagado: "0",
        fechaVencimiento: "2099-09-20",
      }),
    ).rejects.toThrow(/monotributista/);

    expect((await listar(t)).items[0]?.importeDeterminado).toBe("30000.00");
  });
});

describe("aislamiento", () => {
  it("otra empresa no ve, no obtiene ni actualiza", async () => {
    const a = await crearTenantDePrueba();
    const b = await crearTenantDePrueba();
    const creado = await crearImpuesto(a, {
      tipo: "otros",
      periodo: "2026-01",
      importeFijo: "100.00",
      importePagado: "0",
      fechaVencimiento: "2026-01-31",
    });
    await comprobantesConIva(a, mesAtras(1), "210.00", "0");

    expect((await listar(b)).total).toBe(0);
    expect(await obtenerImpuesto(b, creado.id)).toBeNull();
    expect(
      await actualizarImpuesto(b, {
        id: creado.id,
        datos: {
          tipo: "otros",
          periodo: "2026-01",
          importeFijo: "1.00",
          importePagado: "0",
          fechaVencimiento: "2026-01-31",
        },
      }),
    ).toBeNull();
  });
});
