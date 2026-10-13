import { hoyEnArgentina } from "@erp/core/dates";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import type { Sesion } from "../../trpc/context.js";
import { crearCliente } from "../clientes/service.js";
import { armarInforme, InformeNoDisponibleError, mesAnterior } from "./datos.js";
import { dibujarInforme, nombreDelMes } from "./pdf.js";

// El panel trae la cotización del dólar: los tests no salen a internet.
vi.mock("../cotizaciones/dolar.js", () => ({
  cotizacionesDolar: async () => ({ oficial: null, blue: null }),
}));

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

// Relativo a hoy: el estado de resultados termina en el mes en curso real.
const HOY = hoyEnArgentina();
const MES_PASADO = mesAnterior(HOY.slice(0, 7));
const MES_ANTERIOR = mesAnterior(HOY.slice(0, 7), 2);

function contexto(tenantId: string, usuarioId: string, extra: Partial<Sesion> = {}) {
  return {
    session: {
      usuarioId,
      email: "prueba@demo.dev",
      nombre: "Prueba",
      activeOrganizationId: tenantId,
      rolOrganizacion: "administrador" as const,
      esAdminPlataforma: false,
      dosFactoresVerificado: false,
      esAccesoPorLink: false,
      modulosPermitidos: null,
      ...extra,
    },
    headers: new Headers(),
  };
}

async function empresaConVentas() {
  const t = await crearTenantDePrueba();
  const cliente = await crearCliente(t, {
    razonSocial: "Cliente SA",
    condicionIva: "responsable_inscripto",
  });
  await withTenant(t.tenantId, (tx) =>
    tx.insert(comprobantesVenta).values(
      [
        { fecha: `${MES_ANTERIOR}-10`, neto: "1000.00" },
        { fecha: `${MES_PASADO}-10`, neto: "1100.00" },
      ].map((v) => ({
        tenantId: t.tenantId,
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
  return t;
}

describe("informe mensual", () => {
  it("compara el mes con el anterior y sale como PDF", async () => {
    const t = await empresaConVentas();

    const informe = await armarInforme(contexto(t.tenantId, t.usuarioId), MES_PASADO, HOY, {
      conLectura: false,
    });

    expect(informe.actual.ventas).toBe("1100.00");
    expect(informe.anterior?.ventas).toBe("1000.00");
    expect(informe.variaciones.ventas).toBe("10.00");
    expect(informe.deudores[0]?.nombre).toBe("Cliente SA");

    const pdf = await dibujarInforme(informe);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("sólo de los últimos 12 meses cerrados", async () => {
    const t = await crearTenantDePrueba();
    const ctx = contexto(t.tenantId, t.usuarioId);
    // El mes en curso todavía no cerró, y hace 13 meses ya es demasiado.
    await expect(armarInforme(ctx, HOY.slice(0, 7), HOY, { conLectura: false })).rejects.toThrow(
      InformeNoDisponibleError,
    );
    await expect(
      armarInforme(ctx, mesAnterior(HOY.slice(0, 7), 13), HOY, { conLectura: false }),
    ).rejects.toThrow(InformeNoDisponibleError);
  });

  it("un link que no incluye Resultados no puede bajarlo", async () => {
    const t = await empresaConVentas();
    const link = contexto(t.tenantId, t.usuarioId, {
      rolOrganizacion: "solo_lectura",
      esAccesoPorLink: true,
      modulosPermitidos: ["clientes"],
    });

    await expect(armarInforme(link, MES_PASADO, HOY, { conLectura: false })).rejects.toThrow(
      TRPCError,
    );
  });
});

describe("fechas del informe", () => {
  it("el mes anterior cruza el año", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-10", 2)).toBe("2026-08");
  });

  it("nombra el mes en castellano", () => {
    expect(nombreDelMes("2026-09")).toBe("septiembre de 2026");
  });
});
