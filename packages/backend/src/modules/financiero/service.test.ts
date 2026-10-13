import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { productos } from "../../db/schema/stock.js";
import { cheques, cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";

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

import { resumenFinanciero } from "./service.js";

/**
 * El resumen financiero agrega **toda** la empresa, sin filtros: no hay forma
 * de pedirle un subconjunto. Así que cada test arma su propia empresa y RLS la
 * mantiene aislada de las demás.
 */

type Actor = { tenantId: string; usuarioId: string };
type Resumen = Awaited<ReturnType<typeof resumenFinanciero>>;

/** Fecha relativa a hoy en el formato `date` de Postgres, sin pasar por UTC. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

interface Comprobante {
  total: string;
  /** Por defecto, igual al total: la mayoría de los tests no mira el IVA. */
  neto?: string;
  clase?: "factura" | "nota_credito" | "nota_debito";
  estado?: "borrador" | "enviada" | "aprobada" | "rechazada";
  moneda?: "ARS" | "USD";
  /** Días que hace que se emitió. 0 = hoy. */
  emitidaHace?: number;
  /** Días desde la emisión hasta el vencimiento. */
  condicionVentaDias?: number;
  /** Ítems contra un producto del catálogo, con su costo unitario. */
  items?: { cantidad: string; costo: string }[];
}

interface Escenario {
  actor: Actor;
  clienteId: string;
  emitir: (...comprobantes: Comprobante[]) => Promise<void>;
  comprar: (c: { total: string; recibidaHace: number; plazo: number }) => Promise<void>;
  cobrar: (importe: string) => Promise<void>;
  pagar: (importe: string) => Promise<void>;
  recibirCheque: (c: { importe: string; pagaEn: number }) => Promise<void>;
}

async function escenario(): Promise<Escenario> {
  const actor = await crearTenantDePrueba();
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
  });
  const { proveedorId, cuentaId } = await withTenant(actor.tenantId, async (tx) => {
    const [proveedor] = await tx
      .insert(proveedores)
      .values({
        tenantId: actor.tenantId,
        razonSocial: "Proveedor SA",
        condicionIva: "responsable_inscripto",
      })
      .returning();
    const [cuenta] = await tx
      .insert(cuentas)
      .values({ tenantId: actor.tenantId, nombre: "Banco", tipo: "cuenta_corriente" })
      .returning();
    if (!proveedor || !cuenta) {
      throw new Error("No se pudo armar el escenario");
    }
    return { proveedorId: proveedor.id, cuentaId: cuenta.id };
  });

  const movimiento = (tipo: "ingreso" | "egreso", importe: string) =>
    withTenant(actor.tenantId, async (tx) => {
      await tx.insert(movimientos).values({
        tenantId: actor.tenantId,
        fecha: enDias(0),
        cuentaId,
        tipo,
        medioPago: "transferencia",
        importe,
        clienteId: tipo === "ingreso" ? cliente.id : null,
        proveedorId: tipo === "egreso" ? proveedorId : null,
      });
    });

  return {
    actor,
    clienteId: cliente.id,
    emitir: async (...comprobantes) => {
      await withTenant(actor.tenantId, async (tx) => {
        for (const c of comprobantes) {
          const [creado] = await tx
            .insert(comprobantesVenta)
            .values({
              tenantId: actor.tenantId,
              clienteId: cliente.id,
              letra: "A" as const,
              puntoVenta: 1,
              clase: c.clase ?? "factura",
              fechaEmision: enDias(-(c.emitidaHace ?? 0)),
              condicionIvaReceptor: "responsable_inscripto" as const,
              condicionVentaDias: c.condicionVentaDias ?? 0,
              estado: c.estado ?? "enviada",
              moneda: c.moneda ?? "ARS",
              neto: c.neto ?? c.total,
              total: c.total,
            })
            .returning();
          for (const [orden, item] of (c.items ?? []).entries()) {
            const [producto] = await tx
              .insert(productos)
              .values({
                tenantId: actor.tenantId,
                sku: `P-${crypto.randomUUID()}`,
                descripcion: "Producto",
                costoUnitario: item.costo,
                stockActual: "10",
              })
              .returning();
            await tx.insert(itemsComprobanteVenta).values({
              tenantId: actor.tenantId,
              comprobanteId: creado?.id ?? "",
              productoId: producto?.id ?? null,
              descripcion: "Producto",
              cantidad: item.cantidad,
              precioUnitario: "0",
              alicuotaIva: "21",
              orden,
            });
          }
        }
      });
    },
    comprar: ({ total, recibidaHace, plazo }) =>
      withTenant(actor.tenantId, async (tx) => {
        await tx.insert(comprobantesCompra).values({
          tenantId: actor.tenantId,
          proveedorId,
          fechaRecepcion: enDias(-recibidaHace),
          condicionPagoDias: plazo,
          total,
        });
      }),
    cobrar: (importe) => movimiento("ingreso", importe),
    pagar: (importe) => movimiento("egreso", importe),
    recibirCheque: ({ importe, pagaEn }) =>
      withTenant(actor.tenantId, async (tx) => {
        await tx.insert(cheques).values({
          tenantId: actor.tenantId,
          numero: "0001",
          libradorClienteId: cliente.id,
          fechaPago: enDias(pagaEn),
          importe,
          estado: "en_cartera",
        });
      }),
  };
}

/** Las ventas del mes en curso, que es donde caen los comprobantes de hoy. */
function ventasDeEsteMes(resumen: Resumen): string | null {
  const mes = enDias(0).slice(0, 7);
  return resumen.ventasPorMes.find((v) => v.mes === mes)?.total ?? null;
}

function kpi(resumen: Resumen, id: string): string | null {
  return resumen.kpis.find((k) => k.id === id)?.valor ?? null;
}

/** Suma de una columna de la proyección en las 13 semanas, en centavos. */
function totalProyectado(resumen: Resumen, columna: "cobros" | "pagos"): number {
  return resumen.proyeccion.reduce((suma, f) => suma + Math.round(Number(f[columna]) * 100), 0);
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("notas de crédito en el resumen financiero", () => {
  it("restan de las ventas del mes", async () => {
    // Es el caso que importa: la nota de crédito es el único mecanismo para
    // corregir un comprobante con CAE, así que si sumara, devolverle plata a
    // un cliente le subiría las ventas del mes.
    const e = await escenario();
    await e.emitir({ total: "100000.00" }, { clase: "nota_credito", total: "30000.00" });

    expect(ventasDeEsteMes(await resumenFinanciero(e.actor))).toBe("70000.00");
  });

  it("una nota de débito suma, como una factura", async () => {
    // Sin este test, el arreglo del anterior se puede "lograr" negando las
    // tres clases. Una nota de débito agrega deuda: suma.
    const e = await escenario();
    await e.emitir({ total: "100000.00" }, { clase: "nota_debito", total: "30000.00" });

    expect(ventasDeEsteMes(await resumenFinanciero(e.actor))).toBe("130000.00");
  });

  it("no infla el saldo que mide el DSO", async () => {
    // Las dos puntas del DSO se miden distinto: el saldo es histórico y las
    // ventas son de los últimos 30 días. Por eso la nota de crédito va fuera
    // de esa ventana: ahí baja sólo el saldo y el efecto se ve limpio.
    //
    // Ojo con generalizar la dirección: una nota de crédito reciente baja
    // también el denominador y, con un saldo grande, puede *subir* el DSO.
    // Verificado en dev: 77 → 86 días al emitir una de 100.000. Las dos cosas
    // son correctas; lo que importa es que el saldo no incluya la nota.
    const e = await escenario();
    await e.emitir(
      { total: "100000.00", emitidaHace: 40 },
      { total: "50000.00", emitidaHace: 0 },
      { clase: "nota_credito", total: "20000.00", emitidaHace: 40 },
    );

    // (150000 − 20000) / 50000 × 30 = 78 días. Sumando la nota serían 102.
    expect(kpi(await resumenFinanciero(e.actor), "dso")).toBe("78");
  });

  it("descuentan de los cobros proyectados", async () => {
    // El horizonte arranca el lunes de esta semana, así que lo que vence hoy
    // cae siempre en la primera.
    const e = await escenario();
    await e.emitir({ total: "100000.00" }, { clase: "nota_credito", total: "30000.00" });

    const [primera] = (await resumenFinanciero(e.actor)).proyeccion;
    expect(primera?.cobros).toBe("70000.00");
  });

  it("una nota de crédito sin factura deja las ventas del mes en negativo", async () => {
    // Pasa cuando se corrige una factura de un mes anterior. Queda escrito
    // para que sea una decisión y no una sorpresa: el mes muestra lo que
    // efectivamente se facturó, aunque sea menos que cero.
    const e = await escenario();
    await e.emitir({ clase: "nota_credito", total: "30000.00" });

    expect(ventasDeEsteMes(await resumenFinanciero(e.actor))).toBe("-30000.00");
  });

  it("no afectan a las compras, que no pueden ser nota de crédito", async () => {
    // `comprobantes_compra` no tiene columna `clase`. Este test está para que
    // nadie "complete" el arreglo del lado de proveedores: ahí no hay nada que
    // arreglar.
    const e = await escenario();
    await e.emitir({ clase: "nota_credito", total: "30000.00" });

    expect(kpi(await resumenFinanciero(e.actor), "dpo")).toBeNull();
  });
});

describe("lo que cuenta el panel", () => {
  it("las ventas son netas: el IVA no es venta", async () => {
    const e = await escenario();
    await e.emitir({ neto: "100000.00", total: "121000.00" });

    expect(ventasDeEsteMes(await resumenFinanciero(e.actor))).toBe("100000.00");
  });

  it("no cuenta borradores, rechazados ni comprobantes en dólares", async () => {
    // Es lo que ya hace Clientes. Si el panel cuenta otra cosa, las dos
    // pantallas dan totales distintos para la misma empresa.
    const e = await escenario();
    await e.emitir(
      { total: "100.00" },
      { total: "5000.00", estado: "borrador" },
      { total: "7000.00", estado: "rechazada" },
      { total: "900.00", moneda: "USD" },
    );

    expect(ventasDeEsteMes(await resumenFinanciero(e.actor))).toBe("100.00");
  });

  it("un borrador o una factura en dólares no entran en el DSO", async () => {
    // Las ventas del mes y el DSO salen de consultas distintas: cada una
    // necesita su filtro. 100 a cobrar sobre 100 vendidos en 30 días: 30 días.
    // Con el borrador de 900 serían 300.
    const e = await escenario();
    await e.emitir(
      { total: "100.00" },
      { total: "900.00", estado: "borrador", emitidaHace: 40 },
      { total: "900.00", moneda: "USD", emitidaHace: 40 },
    );

    expect(kpi(await resumenFinanciero(e.actor), "dso")).toBe("30");
  });

  it("el margen bruto se calcula sobre el neto, no sobre el total con IVA", async () => {
    // Neto 100, costo 60: margen 40 %. Sobre el total con IVA daría 50,41 %,
    // que es lo que mostraba el panel.
    const e = await escenario();
    await e.emitir({
      neto: "100.00",
      total: "121.00",
      items: [{ cantidad: "1", costo: "60" }],
    });

    expect(kpi(await resumenFinanciero(e.actor), "margen")).toBe("40.00");
  });

  it("una nota de crédito devuelve la mercadería: resta su costo", async () => {
    // Factura neto 200 (2 × costo 60) y nota de crédito neto 100 (1 unidad):
    // ventas 100, costo 60, margen 40 %. Si la nota sumara costo serían 180.
    const e = await escenario();
    await e.emitir(
      { total: "200.00", items: [{ cantidad: "2", costo: "60" }] },
      { clase: "nota_credito", total: "100.00", items: [{ cantidad: "1", costo: "60" }] },
    );

    expect(kpi(await resumenFinanciero(e.actor), "margen")).toBe("40.00");
  });
});

describe("proyección de caja", () => {
  it("un pago vencido e impago entra en la semana en curso", async () => {
    // Antes se descartaba por caer antes del horizonte: con todas las compras
    // vencidas, la proyección mostraba pagos en cero.
    const e = await escenario();
    await e.comprar({ total: "50000.00", recibidaHace: 40, plazo: 30 });

    const r = await resumenFinanciero(e.actor);
    expect(r.proyeccion[0]?.pagos).toBe("50000.00");
    expect(r.pagosVencidos).toBe("50000.00");
  });

  it("una compra ya pagada no se proyecta", async () => {
    const e = await escenario();
    await e.comprar({ total: "50000.00", recibidaHace: 0, plazo: 10 });
    await e.pagar("50000.00");

    expect(totalProyectado(await resumenFinanciero(e.actor), "pagos")).toBe(0);
  });

  it("un cobro vencido no se proyecta: se informa aparte", async () => {
    // Decisión de Fran: prudencia. Plata que no llegó cuando debía no se
    // cuenta como que va a llegar.
    const e = await escenario();
    await e.emitir({ total: "80000.00", emitidaHace: 40, condicionVentaDias: 30 });

    const r = await resumenFinanciero(e.actor);
    expect(totalProyectado(r, "cobros")).toBe(0);
    expect(r.cobrosVencidos).toBe("80000.00");
  });

  it("una factura ya cobrada no se proyecta", async () => {
    const e = await escenario();
    await e.emitir({ total: "100000.00", condicionVentaDias: 10 });
    await e.cobrar("100000.00");

    expect(totalProyectado(await resumenFinanciero(e.actor), "cobros")).toBe(0);
  });

  it("un cobro parcial deja proyectado sólo lo que falta", async () => {
    const e = await escenario();
    await e.emitir({ total: "100000.00", condicionVentaDias: 5 });
    await e.cobrar("40000.00");

    expect(totalProyectado(await resumenFinanciero(e.actor), "cobros")).toBe(6000000);
  });

  it("lo cobrado cancela primero la factura más vieja", async () => {
    // Una vieja vencida y una nueva por vencer, y un cobro por el valor de
    // una: cancela la vieja. Si cancelara la nueva, la proyección mostraría un
    // cobro vencido que ya se cobró.
    const e = await escenario();
    await e.emitir(
      { total: "30000.00", emitidaHace: 40, condicionVentaDias: 30 },
      { total: "50000.00", condicionVentaDias: 10 },
    );
    await e.cobrar("30000.00");

    const r = await resumenFinanciero(e.actor);
    expect(r.cobrosVencidos).toBe("0.00");
    expect(totalProyectado(r, "cobros")).toBe(5000000);
  });

  it("el cheque que cubre una factura se proyecta una sola vez, en su fecha", async () => {
    // El cheque en cartera es el pago de la factura. Proyectar los dos era
    // contar dos veces la misma plata.
    const e = await escenario();
    await e.emitir({ total: "100000.00", condicionVentaDias: 3 });
    await e.recibirCheque({ importe: "100000.00", pagaEn: 20 });

    const r = await resumenFinanciero(e.actor);
    expect(totalProyectado(r, "cobros")).toBe(10000000);
    expect(r.proyeccion[0]?.cobros).toBe("0.00");
  });
});

describe("saldo consolidado", () => {
  it("suma las cuentas en dólares al oficial comprador, sin tocar la liquidez", async () => {
    const e = await escenario();
    await withTenant(e.actor.tenantId, async (tx) => {
      const [usd] = await tx
        .insert(cuentas)
        .values({
          tenantId: e.actor.tenantId,
          nombre: "Dólares",
          tipo: "caja_ahorro",
          moneda: "USD",
        })
        .returning();
      await tx.insert(movimientos).values({
        tenantId: e.actor.tenantId,
        fecha: enDias(0),
        cuentaId: usd?.id ?? "",
        tipo: "ingreso",
        medioPago: "transferencia",
        importe: "100.00",
      });
    });
    await e.cobrar("5000.00");

    const r = await resumenFinanciero(e.actor);
    // 5000 pesos + 100 dólares × 1000 (compra).
    expect(r.consolidado).toMatchObject({
      pesos: "5000.00",
      dolares: "100.00",
      cotizacion: "1000.00",
      total: "105000.00",
    });
    expect(r.saldoPorCuenta.find((c) => c.moneda === "USD")?.saldo).toBe("100.00");
  });
});

describe("rotación de stock", () => {
  it("compara el stock valuado al costo con el costo de lo vendido", async () => {
    // Dos productos con 10 unidades cada uno: uno a costo 100 y otro a 50,
    // stock valuado en 1.500. Se vendieron 3 del primero y 6 del segundo:
    // costo 600. Rotación = 30 × 1.500 / 600 = 75 días. La cuenta vieja
    // (9 unidades contra un stock "promedio por producto" de 10) daba 33.
    const e = await escenario();
    await e.emitir(
      { total: "1000.00", items: [{ cantidad: "3", costo: "100" }] },
      { total: "1000.00", items: [{ cantidad: "6", costo: "50" }] },
    );

    expect(kpi(await resumenFinanciero(e.actor), "rotacion")).toBe("75");
  });
});
