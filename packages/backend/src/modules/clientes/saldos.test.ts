import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { guardarParametros } from "../parametros/service.js";
import { crearCliente, listarClientes, resumenClientes } from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

let tenant: Actor;
let tenantVacio: Actor;
let cuentaPesos: string;
let cuentaDolares: string;

const LISTAR = { orden: "razonSocial", direccion: "asc", pagina: 1, tamanoPagina: 50 } as const;

/** Fecha relativa a hoy en el formato `date` de Postgres, sin pasar por UTC. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

interface Factura {
  clienteId: string;
  total: string;
  clase?: "factura" | "nota_credito" | "nota_debito";
  estado?: "borrador" | "enviada" | "aprobada" | "rechazada";
  moneda?: "ARS" | "USD";
  condicionIva?: "responsable_inscripto" | "monotributo";
  /** Días desde la emisión hasta el vencimiento. */
  condicionVentaDias?: number;
  /** Días que hace que se emitió. 0 = hoy. */
  emitidaHace?: number;
}

function fila(actor: Actor, f: Factura) {
  return {
    tenantId: actor.tenantId,
    letra: "A" as const,
    puntoVenta: 1,
    clienteId: f.clienteId,
    clase: f.clase ?? ("factura" as const),
    fechaEmision: enDias(-(f.emitidaHace ?? 0)),
    condicionIvaReceptor: f.condicionIva ?? ("responsable_inscripto" as const),
    condicionVentaDias: f.condicionVentaDias ?? 0,
    estado: f.estado ?? ("enviada" as const),
    moneda: f.moneda ?? ("ARS" as const),
    total: f.total,
  };
}

async function facturar(actor: Actor, ...facturas: Factura[]): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx.insert(comprobantesVenta).values(facturas.map((f) => fila(actor, f)));
  });
}

async function cobrar(clienteId: string, importe: string, cuentaId = cuentaPesos): Promise<void> {
  await withTenant(tenant.tenantId, async (tx) => {
    await tx.insert(movimientos).values({
      tenantId: tenant.tenantId,
      fecha: enDias(0),
      cuentaId,
      tipo: "ingreso",
      medioPago: "transferencia",
      importe,
      clienteId,
    });
  });
}

async function nuevoCliente(
  actor: Actor,
  razonSocial: string,
  condicionIva: "responsable_inscripto" | "monotributo" = "responsable_inscripto",
): Promise<string> {
  const creado = await crearCliente(actor, { razonSocial, condicionIva });
  return creado.id;
}

async function buscar(razonSocial: string) {
  const { items } = await listarClientes(tenant, LISTAR);
  return items.find((c) => c.razonSocial === razonSocial);
}

beforeAll(async () => {
  tenant = await crearTenantDePrueba();
  tenantVacio = await crearTenantDePrueba();
  await withTenant(tenant.tenantId, async (tx) => {
    const [pesos] = await tx
      .insert(cuentas)
      .values({ tenantId: tenant.tenantId, nombre: "Banco ARS", tipo: "cuenta_corriente" })
      .returning();
    const [dolares] = await tx
      .insert(cuentas)
      .values({
        tenantId: tenant.tenantId,
        nombre: "Banco USD",
        tipo: "cuenta_corriente",
        moneda: "USD",
      })
      .returning();
    cuentaPesos = pesos?.id ?? "";
    cuentaDolares = dolares?.id ?? "";
  });
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("saldo por cliente", () => {
  it("un cliente sin comprobantes no debe nada ni tiene vencimiento", async () => {
    await nuevoCliente(tenant, "Sin movimientos SA");
    const c = await buscar("Sin movimientos SA");
    expect(c?.saldo).toBe("0.00");
    expect(c?.proximoVencimiento).toBeNull();
    expect(c?.tieneMonedaExtranjera).toBe(false);
  });

  it("el saldo es lo facturado menos lo cobrado", async () => {
    const id = await nuevoCliente(tenant, "Deudora SA");
    await facturar(tenant, { clienteId: id, total: "100000.00" });
    await cobrar(id, "30000.00");
    expect((await buscar("Deudora SA"))?.saldo).toBe("70000.00");
  });

  it("un cliente que pagó de más queda con saldo a favor, en negativo", async () => {
    const id = await nuevoCliente(tenant, "Adelantada SA");
    await facturar(tenant, { clienteId: id, total: "10000.00" });
    await cobrar(id, "15000.00");
    expect((await buscar("Adelantada SA"))?.saldo).toBe("-5000.00");
  });

  it("los borradores y los rechazados no son deuda", async () => {
    const id = await nuevoCliente(tenant, "Con borradores SA");
    await facturar(
      tenant,
      { clienteId: id, total: "90000.00", estado: "borrador" },
      { clienteId: id, total: "80000.00", estado: "rechazada" },
      { clienteId: id, total: "20000.00", estado: "aprobada" },
    );
    // Solo entra la aprobada: un borrador no se le reclamó a nadie todavía.
    expect((await buscar("Con borradores SA"))?.saldo).toBe("20000.00");
  });

  it("una nota de crédito resta en vez de sumar", async () => {
    const id = await nuevoCliente(tenant, "Con nota de crédito SA");
    await facturar(
      tenant,
      { clienteId: id, total: "100000.00" },
      { clienteId: id, total: "30000.00", clase: "nota_credito" },
    );
    // Es el único mecanismo de corrección de un comprobante con CAE: si sumara,
    // devolverle plata al cliente le aumentaría la deuda.
    expect((await buscar("Con nota de crédito SA"))?.saldo).toBe("70000.00");
  });

  it("una nota de débito suma, como una factura", async () => {
    const id = await nuevoCliente(tenant, "Con nota de débito SA");
    await facturar(
      tenant,
      { clienteId: id, total: "10000.00" },
      { clienteId: id, total: "2000.00", clase: "nota_debito" },
    );
    expect((await buscar("Con nota de débito SA"))?.saldo).toBe("12000.00");
  });

  it("una nota de crédito no genera próximo vencimiento", async () => {
    const id = await nuevoCliente(tenant, "Solo nota de crédito SA");
    await facturar(tenant, {
      clienteId: id,
      total: "5000.00",
      clase: "nota_credito",
      condicionVentaDias: 15,
    });
    // No es algo a cobrar: no tiene sentido anunciar cuándo "vence".
    expect((await buscar("Solo nota de crédito SA"))?.proximoVencimiento).toBeNull();
  });

  it("el vencimiento es el de la deuda impaga más vieja, aunque ya haya vencido", async () => {
    // Antes se mostraba el vencimiento futuro más cercano: una deuda vencida
    // hace dos meses no aparecía, que es justo lo que hay que ver.
    const id = await nuevoCliente(tenant, "Con vencimientos SA");
    await facturar(
      tenant,
      { clienteId: id, total: "1000.00", emitidaHace: 90, condicionVentaDias: 30 },
      { clienteId: id, total: "1000.00", condicionVentaDias: 10 },
      { clienteId: id, total: "1000.00", condicionVentaDias: 45 },
    );
    expect((await buscar("Con vencimientos SA"))?.proximoVencimiento).toBe(enDias(-60));
  });

  it("una vez cobrada la deuda más vieja, muestra la siguiente", async () => {
    // Lo cobrado cancela primero lo que vence antes. Una factura cobrada no
    // puede seguir figurando como próxima a vencer.
    const id = await nuevoCliente(tenant, "Al día SA");
    await facturar(
      tenant,
      { clienteId: id, total: "1000.00", emitidaHace: 90, condicionVentaDias: 30 },
      { clienteId: id, total: "1000.00", condicionVentaDias: 10 },
    );
    await cobrar(id, "1000.00");
    expect((await buscar("Al día SA"))?.proximoVencimiento).toBe(enDias(10));
  });

  it("los comprobantes en dólares no entran al saldo en pesos, pero se avisan", async () => {
    const id = await nuevoCliente(tenant, "Exportadora SA");
    await facturar(
      tenant,
      { clienteId: id, total: "50000.00" },
      { clienteId: id, total: "900.00", moneda: "USD" },
    );
    const c = await buscar("Exportadora SA");
    expect(c?.saldo).toBe("50000.00");
    expect(c?.tieneMonedaExtranjera).toBe(true);
  });

  it("un cobro en una cuenta en dólares no descuenta del saldo en pesos", async () => {
    const id = await nuevoCliente(tenant, "Cobro mixto SA");
    await facturar(tenant, { clienteId: id, total: "40000.00" });
    await cobrar(id, "1000.00", cuentaDolares);
    expect((await buscar("Cobro mixto SA"))?.saldo).toBe("40000.00");
  });
});

describe("resumen de cartera", () => {
  it("suma solo los saldos deudores y mide la concentración", async () => {
    const t = await crearTenantDePrueba();
    const grande = await nuevoCliente(t, "Grande SA");
    const chico = await nuevoCliente(t, "Chico SA");
    await facturar(
      t,
      { clienteId: grande, total: "75000.00" },
      { clienteId: chico, total: "25000.00" },
    );

    const resumen = await resumenClientes(t, {});
    expect(resumen.totalACobrar).toBe("100000.00");
    expect(resumen.deudores).toBe(2);
    expect(resumen.concentracion).toEqual({ clave: "Grande SA", porcentaje: "75.00" });
    // 75% contra el umbral por defecto de 20% tiene que dar alerta.
    expect(resumen.semaforo).toBe("alerta");
    expect(resumen.umbralConcentracion).toBe("20.00");
  });

  it("respeta el umbral configurado por la empresa", async () => {
    const t = await crearTenantDePrueba();
    const uno = await nuevoCliente(t, "Uno SA");
    const dos = await nuevoCliente(t, "Dos SA");
    await facturar(t, { clienteId: uno, total: "50000.00" }, { clienteId: dos, total: "50000.00" });

    // 50% y 50%: con umbral 20 es alerta, con umbral 60 deja de serlo.
    expect((await resumenClientes(t, {})).semaforo).toBe("alerta");

    await guardarParametros(t, {
      umbralMoraDias: 60,
      margenObjetivo: null,
      minimoOperativo: null,
      umbralConcentracion: "60.00",
    });
    const conUmbralAlto = await resumenClientes(t, {});
    expect(conUmbralAlto.semaforo).toBe("ok");
    expect(conUmbralAlto.umbralConcentracion).toBe("60.00");
  });

  it("un saldo a favor no resta del total a cobrar", async () => {
    const t = await crearTenantDePrueba();
    const debe = await nuevoCliente(t, "Debe SA");
    await facturar(t, { clienteId: debe, total: "80000.00" });

    const resumen = await resumenClientes(t, {});
    expect(resumen.totalACobrar).toBe("80000.00");
    expect(resumen.deudores).toBe(1);
    expect(resumen.concentracion).toEqual({ clave: "Debe SA", porcentaje: "100.00" });
  });

  it("sin clientes no hay concentración que informar", async () => {
    const resumen = await resumenClientes(tenantVacio, {});
    expect(resumen.totalACobrar).toBe("0.00");
    expect(resumen.deudores).toBe(0);
    expect(resumen.concentracion).toBeNull();
    expect(resumen.semaforo).toBe("sin_datos");
  });

  it("el resumen respeta los filtros de la pantalla", async () => {
    const t = await crearTenantDePrueba();
    const ri = await nuevoCliente(t, "RI SA");
    const mono = await nuevoCliente(t, "Mono SA", "monotributo");
    await facturar(
      t,
      { clienteId: ri, total: "30000.00" },
      { clienteId: mono, total: "70000.00", condicionIva: "monotributo" },
    );

    const soloRi = await resumenClientes(t, { condicionIva: "responsable_inscripto" });
    expect(soloRi.totalACobrar).toBe("30000.00");
    expect(soloRi.concentracion).toEqual({ clave: "RI SA", porcentaje: "100.00" });
  });

  it("el aislamiento RLS no deja ver la cartera de otro tenant", async () => {
    const resumen = await resumenClientes(tenantVacio, {});
    expect(resumen.totalACobrar).toBe("0.00");
    expect(resumen.concentracion).toBeNull();
  });
});
