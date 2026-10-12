import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { resumenFinanciero } from "./service.js";

/**
 * El resumen financiero agrega **toda** la empresa, sin filtros: no hay forma
 * de pedirle un subconjunto. Así que cada test arma su propia empresa y RLS la
 * mantiene aislada de las demás.
 */

type Actor = { tenantId: string; usuarioId: string };

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
  clase?: "factura" | "nota_credito" | "nota_debito";
  /** Días que hace que se emitió. 0 = hoy. */
  emitidaHace?: number;
  /** Días desde la emisión hasta el vencimiento. */
  condicionVentaDias?: number;
}

interface Escenario {
  actor: Actor;
  emitir: (...comprobantes: Comprobante[]) => Promise<void>;
}

async function escenario(): Promise<Escenario> {
  const actor = await crearTenantDePrueba();
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
  });

  return {
    actor,
    emitir: async (...comprobantes) => {
      await withTenant(actor.tenantId, async (tx) => {
        await tx.insert(comprobantesVenta).values(
          comprobantes.map((c) => ({
            tenantId: actor.tenantId,
            clienteId: cliente.id,
            letra: "A" as const,
            puntoVenta: 1,
            clase: c.clase ?? ("factura" as const),
            fechaEmision: enDias(-(c.emitidaHace ?? 0)),
            condicionIvaReceptor: "responsable_inscripto" as const,
            condicionVentaDias: c.condicionVentaDias ?? 0,
            estado: "enviada" as const,
            total: c.total,
          })),
        );
      });
    },
  };
}

/** Las ventas del mes en curso, que es donde caen los comprobantes de hoy. */
function ventasDeEsteMes(resumen: Awaited<ReturnType<typeof resumenFinanciero>>): string | null {
  const mes = enDias(0).slice(0, 7);
  return resumen.ventasPorMes.find((v) => v.mes === mes)?.total ?? null;
}

function kpi(resumen: Awaited<ReturnType<typeof resumenFinanciero>>, id: string): string | null {
  return resumen.kpis.find((k) => k.id === id)?.valor ?? null;
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

  it("descuentan de los cobros proyectados de la semana en que vencen", async () => {
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
