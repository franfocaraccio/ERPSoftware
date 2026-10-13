import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import { guardarParametros } from "../parametros/service.js";
import { actualizarMovimiento, crearCuenta, crearMovimiento } from "../tesoreria/service.js";
import { fichaCliente } from "./fichas.js";
import { comprobantesAbiertos } from "./imputaciones.js";

type Actor = { tenantId: string; usuarioId: string };

function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Escenario {
  actor: Actor;
  clienteId: string;
  cuentaId: string;
  factura: (
    total: string,
    opciones?: {
      emitidaHace?: number;
      plazo?: number;
      estado?: "borrador" | "enviada";
      clase?: "factura" | "nota_credito";
      clienteId?: string;
    },
  ) => Promise<string>;
  cobro: (
    importe: string,
    imputaciones?: { comprobanteId: string; importe: string }[],
  ) => Promise<string>;
}

async function escenario(): Promise<Escenario> {
  const actor = await crearTenantDePrueba();
  const cliente = await crearCliente(actor, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
    limiteCredito: "1000.00",
  });
  const cuenta = await crearCuenta(actor, {
    nombre: "Banco",
    tipo: "cuenta_corriente",
    moneda: "ARS",
  });
  return {
    actor,
    clienteId: cliente.id,
    cuentaId: cuenta.id,
    factura: async (total, o = {}) =>
      withTenant(actor.tenantId, async (tx) => {
        const [f] = await tx
          .insert(comprobantesVenta)
          .values({
            tenantId: actor.tenantId,
            clienteId: o.clienteId ?? cliente.id,
            clase: o.clase ?? "factura",
            letra: "A",
            puntoVenta: 1,
            fechaEmision: enDias(-(o.emitidaHace ?? 0)),
            condicionIvaReceptor: "responsable_inscripto",
            condicionVentaDias: o.plazo ?? 30,
            estado: o.estado ?? "enviada",
            neto: total,
            total,
          })
          .returning();
        return f?.id ?? "";
      }),
    cobro: async (importe, imputaciones = []) =>
      (
        await crearMovimiento(actor, {
          fecha: enDias(0),
          cuentaId: cuenta.id,
          tipo: "ingreso",
          medioPago: "transferencia",
          importe,
          clienteId: cliente.id,
          conciliado: false,
          imputaciones,
        })
      ).id,
  };
}

async function abiertos(e: Escenario, movimientoId: string | null = null) {
  return withTenant(e.actor.tenantId, (tx) =>
    comprobantesAbiertos(tx, "ventas", e.clienteId, movimientoId),
  );
}

async function ficha(e: Escenario) {
  const f = await fichaCliente(e.actor, e.clienteId);
  if (!f) {
    throw new Error("sin ficha");
  }
  return f;
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("imputaciones", () => {
  it("un cobro imputado cancela esa factura, no la más vieja", async () => {
    // Sin imputar, FIFO cancelaría la vieja. El cliente dijo qué pagaba.
    const e = await escenario();
    const vieja = await e.factura("100.00", { emitidaHace: 40 });
    const nueva = await e.factura("100.00");
    await e.cobro("100.00", [{ comprobanteId: nueva, importe: "100.00" }]);

    const r = await abiertos(e);
    expect(r.map((c) => c.id)).toEqual([vieja]);
  });

  it("un cobro parcial deja la factura parcial con lo que falta", async () => {
    const e = await escenario();
    const f = await e.factura("100.00");
    await e.cobro("30.00", [{ comprobanteId: f, importe: "30.00" }]);

    const [abierto] = (await ficha(e)).abiertos;
    expect(abierto?.pendiente).toBe("70.00");
    expect(abierto?.estado).toBe("parcial");
  });

  it("lo que no se imputa queda a cuenta y se aplica FIFO", async () => {
    const e = await escenario();
    const vieja = await e.factura("100.00", { emitidaHace: 40 });
    const nueva = await e.factura("100.00");
    // 150: 50 imputados a la nueva y 100 a cuenta, que cancelan la vieja.
    await e.cobro("150.00", [{ comprobanteId: nueva, importe: "50.00" }]);

    const f = await ficha(e);
    expect(f.abiertos.map((c) => [c.id, c.pendiente])).toEqual([[nueva, "50.00"]]);
    expect(vieja).toBeTruthy();
  });

  it("un pago a cuenta sin deuda queda como saldo a favor", async () => {
    const e = await escenario();
    await e.cobro("80.00");

    const f = await ficha(e);
    expect(f.aCuenta).toBe("80.00");
    expect(f.saldo).toBe("-80.00");
  });

  it("no deja imputar más que el cobro ni más de lo que le queda a la factura", async () => {
    const e = await escenario();
    const a = await e.factura("100.00");
    const b = await e.factura("100.00");

    await expect(
      e.cobro("100.00", [
        { comprobanteId: a, importe: "60.00" },
        { comprobanteId: b, importe: "60.00" },
      ]),
    ).rejects.toThrow(/más de lo que dice el movimiento/);

    await e.cobro("70.00", [{ comprobanteId: a, importe: "70.00" }]);
    await expect(e.cobro("50.00", [{ comprobanteId: a, importe: "50.00" }])).rejects.toThrow(
      /le queda/,
    );
  });

  it("no deja imputar una factura de otro cliente, un borrador ni una nota de crédito", async () => {
    const e = await escenario();
    const otro = await crearCliente(e.actor, {
      razonSocial: "Otro SA",
      condicionIva: "responsable_inscripto",
    });
    const ajena = await e.factura("100.00", { clienteId: otro.id });
    const borrador = await e.factura("100.00", { estado: "borrador" });
    const nc = await e.factura("10.00", { clase: "nota_credito" });

    await expect(e.cobro("10.00", [{ comprobanteId: ajena, importe: "10.00" }])).rejects.toThrow(
      /no es de esta contraparte/,
    );
    await expect(e.cobro("10.00", [{ comprobanteId: borrador, importe: "10.00" }])).rejects.toThrow(
      /enviados o aprobados/,
    );
    await expect(e.cobro("10.00", [{ comprobanteId: nc, importe: "10.00" }])).rejects.toThrow(
      /enviados o aprobados/,
    );
  });

  it("no deja imputar un cobro sin cliente", async () => {
    const e = await escenario();
    const f = await e.factura("100.00");
    await expect(
      crearMovimiento(e.actor, {
        fecha: enDias(0),
        cuentaId: e.cuentaId,
        tipo: "ingreso",
        medioPago: "efectivo",
        importe: "10.00",
        conciliado: false,
        imputaciones: [{ comprobanteId: f, importe: "10.00" }],
      }),
    ).rejects.toThrow(/elegí el cliente/);
  });

  it("al editar el movimiento, sus imputaciones se reemplazan", async () => {
    const e = await escenario();
    const a = await e.factura("100.00", { emitidaHace: 40 });
    const b = await e.factura("100.00");
    const id = await e.cobro("100.00", [{ comprobanteId: a, importe: "100.00" }]);

    await actualizarMovimiento(e.actor, {
      id,
      datos: {
        fecha: enDias(0),
        cuentaId: e.cuentaId,
        tipo: "ingreso",
        medioPago: "transferencia",
        importe: "100.00",
        clienteId: e.clienteId,
        conciliado: false,
        imputaciones: [{ comprobanteId: b, importe: "100.00" }],
      },
    });

    expect((await abiertos(e)).map((c) => c.id)).toEqual([a]);
    // Al editar, ve lo suyo con lo disponible sin contarse a sí mismo.
    const vistos = await abiertos(e, id);
    expect(vistos.find((c) => c.id === b)?.imputadoAca).toBe("100.00");
    expect(vistos.find((c) => c.id === b)?.disponible).toBe("100.00");
  });

  it("si la factura se rechaza después de cobrada, lo imputado vuelve a cuenta", async () => {
    const e = await escenario();
    const f = await e.factura("100.00");
    await e.cobro("100.00", [{ comprobanteId: f, importe: "100.00" }]);
    await withTenant(e.actor.tenantId, (tx) =>
      tx.update(comprobantesVenta).set({ estado: "rechazada" }).where(eq(comprobantesVenta.id, f)),
    );

    expect((await ficha(e)).aCuenta).toBe("100.00");
  });

  it("no ve ni imputa comprobantes de otra empresa", async () => {
    const a = await escenario();
    const b = await escenario();
    const deA = await a.factura("100.00");

    await expect(b.cobro("10.00", [{ comprobanteId: deA, importe: "10.00" }])).rejects.toThrow(
      /no es de esta contraparte/,
    );
    const vistos = await withTenant(b.actor.tenantId, (tx) =>
      comprobantesAbiertos(tx, "ventas", a.clienteId, null),
    );
    expect(vistos).toEqual([]);
  });
});

describe("ficha del cliente", () => {
  it("reparte la deuda por antigüedad", async () => {
    const e = await escenario();
    await e.factura("10.00", { plazo: 30 }); // a vencer
    await e.factura("20.00", { emitidaHace: 45, plazo: 30 }); // 15 días
    await e.factura("40.00", { emitidaHace: 130, plazo: 30 }); // 100 días

    const { antiguedad } = await ficha(e);
    expect(antiguedad).toEqual({
      aVencer: "10.00",
      hasta30: "20.00",
      de31a60: "0.00",
      de61a90: "0.00",
      masDe90: "40.00",
    });
  });

  it("está en mora con deuda vencida hace más que el umbral de Parámetros", async () => {
    const e = await escenario();
    await e.factura("10.00", { emitidaHace: 50, plazo: 0 });
    expect((await ficha(e)).enMora).toBe(false); // umbral por defecto: 60

    await guardarParametros(e.actor, {
      umbralMoraDias: 30,
      margenObjetivo: null,
      minimoOperativo: null,
      umbralConcentracion: "20.00",
    });
    expect((await ficha(e)).enMora).toBe(true);
  });

  it("avisa cuando el saldo supera el límite de crédito, con el porcentaje usado", async () => {
    const e = await escenario(); // límite 1000
    await e.factura("1250.00");

    const f = await ficha(e);
    expect(f.excedeLimite).toBe(true);
    expect(f.creditoUsado).toBe("125.00");
  });
});
