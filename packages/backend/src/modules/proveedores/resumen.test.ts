import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { guardarParametros } from "../parametros/service.js";
import { crearProveedor, listarProveedores, resumenProveedores } from "./service.js";

type Actor = { tenantId: string; usuarioId: string };

let tenant: Actor;
let tenantVacio: Actor;
let cuentaPesos: string;
let cuentaDolares: string;

const LISTAR = { orden: "razonSocial", direccion: "asc", pagina: 1, tamanoPagina: 50 } as const;

/** Fecha relativa a hoy: una fija deja de ser futura cuando pasa el día. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

interface Compra {
  proveedorId: string;
  total: string;
  moneda?: "ARS" | "USD";
  condicionPagoDias?: number;
  recibidaHace?: number;
}

async function comprar(actor: Actor, ...compras: Compra[]): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx.insert(comprobantesCompra).values(
      compras.map((c) => ({
        tenantId: actor.tenantId,
        proveedorId: c.proveedorId,
        fechaRecepcion: enDias(-(c.recibidaHace ?? 0)),
        condicionPagoDias: c.condicionPagoDias ?? 0,
        moneda: c.moneda ?? ("ARS" as const),
        total: c.total,
      })),
    );
  });
}

async function pagar(proveedorId: string, importe: string, cuentaId = cuentaPesos): Promise<void> {
  await withTenant(tenant.tenantId, async (tx) => {
    await tx.insert(movimientos).values({
      tenantId: tenant.tenantId,
      fecha: enDias(0),
      cuentaId,
      tipo: "egreso",
      medioPago: "transferencia",
      importe,
      proveedorId,
    });
  });
}

async function nuevoProveedor(
  actor: Actor,
  razonSocial: string,
  condicionIva: "responsable_inscripto" | "monotributo" = "responsable_inscripto",
): Promise<string> {
  const creado = await crearProveedor(actor, { razonSocial, condicionIva, condicionPagoDias: 30 });
  return creado.id;
}

async function buscar(razonSocial: string) {
  const { items } = await listarProveedores(tenant, LISTAR);
  return items.find((p) => p.razonSocial === razonSocial);
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

describe("saldo a pagar y monedas", () => {
  it("las compras en dólares no entran al saldo en pesos, pero se avisan", async () => {
    const id = await nuevoProveedor(tenant, "Importadora SA");
    await comprar(
      tenant,
      { proveedorId: id, total: "80000.00" },
      { proveedorId: id, total: "500.00", moneda: "USD" },
    );
    const p = await buscar("Importadora SA");
    expect(p?.saldoAPagar).toBe("80000.00");
    expect(p?.tieneMonedaExtranjera).toBe(true);
  });

  it("un pago desde una cuenta en dólares no descuenta del saldo en pesos", async () => {
    const id = await nuevoProveedor(tenant, "Mixta SA");
    await comprar(tenant, { proveedorId: id, total: "60000.00" });
    await pagar(id, "300.00", cuentaDolares);
    expect((await buscar("Mixta SA"))?.saldoAPagar).toBe("60000.00");
  });

  it("sin compras en otra moneda no se avisa nada", async () => {
    const id = await nuevoProveedor(tenant, "Local SA");
    await comprar(tenant, { proveedorId: id, total: "10000.00" });
    await pagar(id, "4000.00");
    const p = await buscar("Local SA");
    expect(p?.saldoAPagar).toBe("6000.00");
    expect(p?.tieneMonedaExtranjera).toBe(false);
  });
});

describe("resumen de proveedores", () => {
  it("suma solo los saldos pendientes y mide la concentración", async () => {
    const t = await crearTenantDePrueba();
    const grande = await nuevoProveedor(t, "Mayorista Central");
    const chico = await nuevoProveedor(t, "Insumos Varios");
    await comprar(
      t,
      { proveedorId: grande, total: "180000.00" },
      { proveedorId: chico, total: "20000.00" },
    );

    const resumen = await resumenProveedores(t, {});
    expect(resumen.totalAPagar).toBe("200000.00");
    expect(resumen.acreedores).toBe(2);
    expect(resumen.concentracion).toEqual({ clave: "Mayorista Central", porcentaje: "90.00" });
    expect(resumen.semaforo).toBe("alerta");
    expect(resumen.umbralConcentracion).toBe("20.00");
  });

  it("respeta el umbral configurado por la empresa", async () => {
    const t = await crearTenantDePrueba();
    const uno = await nuevoProveedor(t, "Uno SA");
    const dos = await nuevoProveedor(t, "Dos SA");
    await comprar(
      t,
      { proveedorId: uno, total: "50000.00" },
      { proveedorId: dos, total: "50000.00" },
    );

    expect((await resumenProveedores(t, {})).semaforo).toBe("alerta");

    await guardarParametros(t, {
      umbralMoraDias: 60,
      margenObjetivo: null,
      minimoOperativo: null,
      umbralConcentracion: "60.00",
    });
    expect((await resumenProveedores(t, {})).semaforo).toBe("ok");
  });

  it("un saldo a favor con un proveedor no resta de lo que se le debe al resto", async () => {
    const t = await crearTenantDePrueba();
    const debe = await nuevoProveedor(t, "Se le debe SA");
    await comprar(t, { proveedorId: debe, total: "70000.00" });

    const resumen = await resumenProveedores(t, {});
    expect(resumen.totalAPagar).toBe("70000.00");
    expect(resumen.acreedores).toBe(1);
    expect(resumen.concentracion).toEqual({ clave: "Se le debe SA", porcentaje: "100.00" });
  });

  it("sin proveedores no hay concentración que informar", async () => {
    const resumen = await resumenProveedores(tenantVacio, {});
    expect(resumen.totalAPagar).toBe("0.00");
    expect(resumen.acreedores).toBe(0);
    expect(resumen.concentracion).toBeNull();
    expect(resumen.semaforo).toBe("sin_datos");
  });

  it("el resumen respeta los filtros de la pantalla", async () => {
    const t = await crearTenantDePrueba();
    const ri = await nuevoProveedor(t, "RI SA");
    const mono = await nuevoProveedor(t, "Mono SA", "monotributo");
    await comprar(
      t,
      { proveedorId: ri, total: "30000.00" },
      { proveedorId: mono, total: "70000.00" },
    );

    const soloRi = await resumenProveedores(t, { condicionIva: "responsable_inscripto" });
    expect(soloRi.totalAPagar).toBe("30000.00");
    expect(soloRi.concentracion).toEqual({ clave: "RI SA", porcentaje: "100.00" });
  });

  it("una compra en dólares no infla el total a pagar", async () => {
    const t = await crearTenantDePrueba();
    const p = await nuevoProveedor(t, "Solo dólares SA");
    await comprar(t, { proveedorId: p, total: "1000.00", moneda: "USD" });

    const resumen = await resumenProveedores(t, {});
    expect(resumen.totalAPagar).toBe("0.00");
    expect(resumen.hayMonedaExtranjera).toBe(true);
  });
});
