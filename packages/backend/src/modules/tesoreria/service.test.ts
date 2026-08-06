import { hoyEnArgentina } from "@erp/core/dates";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import {
  actualizarCheque,
  crearCheque,
  crearCuenta,
  crearMovimiento,
  listarCheques,
  listarCuentas,
  listarMovimientos,
  obtenerCuenta,
} from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };

/**
 * Fecha ISO desplazada N días respecto de hoy en Argentina, que es la misma
 * referencia que usa el service. Calcular esto en UTC correría un día cuando
 * la hora local ya pasó las 21:00.
 */
function enDias(dias: number): string {
  const d = new Date(`${hoyEnArgentina()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  tenantA = await crearTenantDePrueba();
  tenantB = await crearTenantDePrueba();
});

afterAll(async () => {
  await pool.end();
});

describe("tesorería service (integración, RLS activo)", () => {
  it("una cuenta nueva arranca con saldo cero", async () => {
    await crearCuenta(tenantA, { nombre: "Caja", tipo: "efectivo", moneda: "ARS" });
    const { items, saldoConsolidadoArs } = await listarCuentas(tenantA);
    expect(items[0]?.saldo).toBe("0.00");
    expect(saldoConsolidadoArs).toBe("0.00");
  });

  it("el saldo es ingresos menos egresos", async () => {
    const { items } = await listarCuentas(tenantA);
    const cuentaId = items[0]?.id ?? "";

    await crearMovimiento(tenantA, {
      fecha: "2026-08-01",
      cuentaId,
      tipo: "ingreso",
      medioPago: "efectivo",
      importe: "150000.00",
      conciliado: false,
    });
    await crearMovimiento(tenantA, {
      fecha: "2026-08-02",
      cuentaId,
      tipo: "egreso",
      medioPago: "transferencia",
      importe: "42000.50",
      conciliado: false,
    });

    const { items: conSaldo, saldoConsolidadoArs } = await listarCuentas(tenantA);
    expect(conSaldo[0]?.saldo).toBe("107999.50");
    expect(saldoConsolidadoArs).toBe("107999.50");
  });

  it("el consolidado suma solo las cuentas en pesos", async () => {
    const cuentaUsd = await crearCuenta(tenantA, {
      nombre: "Banco USD",
      tipo: "caja_ahorro",
      moneda: "USD",
    });
    await crearMovimiento(tenantA, {
      fecha: "2026-08-03",
      cuentaId: cuentaUsd.id,
      tipo: "ingreso",
      medioPago: "transferencia",
      importe: "5000.00",
      conciliado: false,
    });

    const { items, saldoConsolidadoArs } = await listarCuentas(tenantA);
    const usd = items.find((c) => c.moneda === "USD");
    expect(usd?.saldo).toBe("5000.00");
    // El saldo en dólares no entra al consolidado en pesos.
    expect(saldoConsolidadoArs).toBe("107999.50");
  });

  it("filtra movimientos por rango de fechas", async () => {
    const { total } = await listarMovimientos(tenantA, {
      desde: "2026-08-02",
      hasta: "2026-08-02",
      pagina: 1,
      tamanoPagina: 50,
    });
    expect(total).toBe(1);
  });

  it("registra un cheque con librador cliente y calcula días para cobro", async () => {
    const cliente = await crearCliente(tenantA, {
      razonSocial: "Comercial Sur SA",
      condicionIva: "responsable_inscripto",
    });
    await crearCheque(tenantA, {
      numero: "00012345",
      libradorClienteId: cliente.id,
      banco: "Banco Nación",
      fechaPago: enDias(15),
      importe: "80000.00",
      estado: "en_cartera",
    });

    const { items, totalEnCartera } = await listarCheques(tenantA, { pagina: 1, tamanoPagina: 50 });
    expect(items[0]?.libradorNombreEfectivo).toBe("Comercial Sur SA");
    expect(items[0]?.diasParaCobro).toBe(15);
    expect(totalEnCartera).toBe("80000.00");
  });

  it("acepta un cheque de tercero con librador de texto libre", async () => {
    await crearCheque(tenantA, {
      numero: "00099999",
      libradorNombre: "Juan Pérez",
      fechaPago: enDias(-3),
      importe: "25000.00",
      estado: "en_cartera",
    });

    const { items } = await listarCheques(tenantA, { pagina: 1, tamanoPagina: 50 });
    const tercero = items.find((c) => c.numero === "00099999");
    expect(tercero?.libradorNombreEfectivo).toBe("Juan Pérez");
    // Fecha ya pasada: días negativos.
    expect(tercero?.diasParaCobro).toBe(-3);
  });

  it("el total en cartera excluye los cheques depositados", async () => {
    const { items } = await listarCheques(tenantA, { pagina: 1, tamanoPagina: 50 });
    const id = items.find((c) => c.numero === "00099999")?.id ?? "";

    await actualizarCheque(tenantA, {
      id,
      datos: {
        numero: "00099999",
        libradorNombre: "Juan Pérez",
        fechaPago: enDias(-3),
        importe: "25000.00",
        estado: "depositado",
      },
    });

    const { totalEnCartera } = await listarCheques(tenantA, { pagina: 1, tamanoPagina: 50 });
    expect(totalEnCartera).toBe("80000.00");
  });

  it("filtra cheques por estado", async () => {
    const { items } = await listarCheques(tenantA, {
      estado: "depositado",
      pagina: 1,
      tamanoPagina: 50,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.numero).toBe("00099999");
  });

  it("el aislamiento RLS impide ver cuentas, movimientos y cheques de otro tenant", async () => {
    const { items: cuentasB, saldoConsolidadoArs } = await listarCuentas(tenantB);
    expect(cuentasB).toHaveLength(0);
    expect(saldoConsolidadoArs).toBe("0.00");

    const { total: movsB } = await listarMovimientos(tenantB, { pagina: 1, tamanoPagina: 50 });
    expect(movsB).toBe(0);

    const { total: chequesB } = await listarCheques(tenantB, { pagina: 1, tamanoPagina: 50 });
    expect(chequesB).toBe(0);
  });

  it("obtener una cuenta de otro tenant devuelve null", async () => {
    const { items } = await listarCuentas(tenantA);
    expect(await obtenerCuenta(tenantB, items[0]?.id ?? "")).toBeNull();
  });
});
