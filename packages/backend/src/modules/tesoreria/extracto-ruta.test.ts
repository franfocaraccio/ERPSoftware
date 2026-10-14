import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCuenta } from "./service.js";

/**
 * La ruta que recibe el extracto, de punta a punta sobre un servidor real.
 *
 * Se reemplaza sólo la sesión. Multer, el lector de Excel, el intérprete del
 * extracto y la consulta a la base son los reales: son lo que se quiere probar.
 */

const { resolverSesion } = vi.hoisted(() => ({ resolverSesion: vi.fn() }));
vi.mock("../../trpc/context.js", () => ({ resolverSesion }));

const { extractoRouter } = await import("./extracto-ruta.js");

const NS_X = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const celda = (t: string) => `<x:c s="0" t="str"><x:v>${t}</x:v></x:c>`;

/** Un extracto con la forma real de Galicia: BOM, prefijo x:, sin referencias. */
function extractoGalicia(...filas: string[][]): Uint8Array {
  const cuerpo = filas.map((f) => `<x:row>${f.map(celda).join("")}</x:row>`).join("");
  const hoja = `\ufeff<?xml version="1.0"?><x:worksheet ${NS_X}><x:sheetData>${cuerpo}</x:sheetData></x:worksheet>`;
  return zipSync({ "xl/worksheets/sheet1.xml": strToU8(hoja) });
}

const EXTRACTO = extractoGalicia(
  ["Fecha", "Movimiento", "Débito", "Crédito", "Saldo Parcial"],
  ["09/10/2026", "TRANSFERENCIA A TERCEROS", "-3.600,00", "0,00", "11400"],
  ["05/10/2026", "CREDITO TRANSFERENCIA", "0,00", "15.000,00", "15000"],
);

let servidor: Server;
let puerto: number;
let tenant: { tenantId: string; usuarioId: string };
let cuentaId: string;

function conSesion(tenantId: string, rol = "administrador"): void {
  resolverSesion.mockResolvedValue({
    activeOrganizationId: tenantId,
    usuarioId: "u1",
    rolOrganizacion: rol,
  });
}

async function subir(
  opciones: { bytes?: Uint8Array; cuenta?: string | null; sinArchivo?: boolean } = {},
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const cuerpo = new FormData();
  if (!opciones.sinArchivo) {
    const bytes = opciones.bytes ?? EXTRACTO;
    cuerpo.append("archivo", new Blob([bytes.buffer as ArrayBuffer]), "extracto.xlsx");
  }
  if (opciones.cuenta !== null) {
    cuerpo.append("cuentaId", opciones.cuenta ?? cuentaId);
  }
  const r = await fetch(`http://localhost:${puerto}/api/tesoreria/extracto`, {
    method: "POST",
    body: cuerpo,
  });
  return { estado: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  tenant = await crearTenantDePrueba();
  cuentaId = (
    await crearCuenta(tenant, { nombre: "Galicia CC", tipo: "cuenta_corriente", moneda: "ARS" })
  ).id;
  const app = express();
  app.use(extractoRouter);
  servidor = createServer(app);
  await new Promise<void>((listo) => servidor.listen(0, listo));
  puerto = (servidor.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((listo) => servidor.close(() => listo()));
  await limpiarTenantsDePrueba();
  await pool.end();
});

beforeEach(() => {
  conSesion(tenant.tenantId);
});

describe("quién puede subir un extracto", () => {
  it("sin sesión, no", async () => {
    resolverSesion.mockResolvedValue(null);
    expect((await subir()).estado).toBe(401);
  });

  it("no recibe el archivo de un desconocido: la sesión se mira primero", async () => {
    // Un archivo MÁS GRANDE que el tope, sin sesión. Con 401, multer nunca
    // corrió; con 413, el servidor se habría tragado seis megas de alguien sin
    // identificar. Con un archivo chico los dos órdenes contestan igual.
    resolverSesion.mockResolvedValue(null);
    const r = await subir({ bytes: new Uint8Array(6 * 1024 * 1024) }).catch(() => ({
      estado: "la conexión se cortó",
    }));
    expect(r.estado).toBe(401);
  });

  it("un rol de solo lectura no puede conciliar", async () => {
    conSesion(tenant.tenantId, "solo_lectura");
    expect((await subir()).estado).toBe(403);
  });
});

describe("qué acepta", () => {
  it("un extracto de Galicia devuelve la propuesta y el hash del archivo", async () => {
    const r = await subir();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.saldo).toEqual({ ok: true, inicial: "0.00", final: "11400.00" });
    expect((r.cuerpo.lineas as unknown[]).length).toBe(2);
    expect((r.cuerpo.archivo as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("algo que no es un Excel se rechaza diciendo qué es", async () => {
    const r = await subir({ bytes: new TextEncoder().encode("no soy un Excel") });
    expect(r.estado).toBe(415);
  });

  it("un Excel que no es un extracto se rechaza explicando qué faltaba", async () => {
    const r = await subir({ bytes: extractoGalicia(["Nombre", "Apellido"], ["Juan", "Pérez"]) });
    expect(r.estado).toBe(422);
    expect(r.cuerpo.error).toMatch(/Fecha.*Saldo/);
  });

  it("sin cuenta no sabe contra qué conciliar", async () => {
    expect((await subir({ cuenta: null })).estado).toBe(400);
    expect((await subir({ cuenta: "no-es-un-uuid" })).estado).toBe(400);
  });

  it("la cuenta de otra empresa se trata como inexistente", async () => {
    const otra = await crearTenantDePrueba();
    conSesion(otra.tenantId);
    expect((await subir()).estado).toBe(404);
  });

  it("sin archivo no hay nada que leer", async () => {
    expect((await subir({ sinArchivo: true })).estado).toBe(400);
  });
});
