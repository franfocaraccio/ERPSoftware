import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearProveedor } from "../proveedores/service.js";

/**
 * La ruta de lectura, probada de punta a punta sobre un servidor de verdad.
 *
 * Lo que se verifica acá no es la interpretación —eso vive en `lectura.ts` y
 * tiene sus propios tests— sino lo que pasa **cuando algo sale mal**: sin
 * sesión, sin permiso, con un archivo que no es lo que dice ser, con el cupo
 * agotado o con el modelo caído. Son los caminos que en la práctica nunca se
 * recorren a mano y que, sin esto, nadie ejecutó nunca.
 *
 * El modelo y la sesión se reemplazan; multer, la detección de tipo por
 * contenido, el contador de cupo y las búsquedas contra la base son los
 * reales, porque son justamente lo que se quiere probar.
 */

// El tope sale del entorno al importar el módulo, así que se fija antes.
process.env.LECTURA_LIMITE_DIARIO = "2";
process.env.OPENAI_API_KEY = "test-key";

const { resolverSesion } = vi.hoisted(() => ({ resolverSesion: vi.fn() }));
const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock("../../trpc/context.js", () => ({ resolverSesion }));
vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => "modelo-de-prueba" }));

const { lecturaComprobantesRouter } = await import("./lectura-ruta.js");

/** Un PDF de verdad para la detección por contenido: empieza con "%PDF-". */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
/** Un HTML con nombre de PDF, que es el archivo que hay que rechazar. */
const HTML_DISFRAZADO = new TextEncoder().encode("<html><script>alert(1)</script>");

/** Lo que devolvería el modelo: todos los campos, vacíos salvo los que importan. */
function leido(parcial: Record<string, unknown> = {}) {
  return {
    emisorRazonSocial: "Proveedora SA",
    emisorCuit: "30716644495",
    receptorRazonSocial: "Cliente SA",
    receptorCuit: "30692138747",
    letra: "A",
    puntoVenta: "00001",
    numero: "00000123",
    numeroCompleto: "",
    fechaEmision: "09/10/2026",
    concepto: "Servicios",
    neto: "10000,00",
    iva: "2100,00",
    otrosTributos: "0,00",
    total: "12100,00",
    cae: "",
    caeVencimiento: "",
    items: [
      { descripcion: "Servicio", cantidad: "1,00", precioUnitario: "10000,00", alicuotaIva: "21" },
    ],
    ...parcial,
  };
}

let servidor: Server;
let puerto: number;
let tenant: { tenantId: string; usuarioId: string };

/** La sesión que devuelve el mock: por defecto, alguien que puede escribir. */
function conSesion(tenantId: string, rol = "administrador"): void {
  resolverSesion.mockResolvedValue({
    activeOrganizationId: tenantId,
    usuarioId: "u1",
    rolOrganizacion: rol,
  });
}

async function leer(
  opciones: {
    bytes?: Uint8Array;
    tipo?: string | null;
    nombre?: string;
    sinArchivo?: boolean;
  } = {},
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const cuerpo = new FormData();
  if (!opciones.sinArchivo) {
    const bytes = opciones.bytes ?? PDF;
    cuerpo.append(
      "archivo",
      // El Blob acepta el buffer del Uint8Array; el cast es sólo para TypeScript,
      // que no tiene los tipos del DOM en el backend.
      new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
      opciones.nombre ?? "factura.pdf",
    );
  }
  if (opciones.tipo !== null) {
    cuerpo.append("tipo", opciones.tipo ?? "compra");
  }

  const respuesta = await fetch(`http://localhost:${puerto}/api/comprobantes/leer`, {
    method: "POST",
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  tenant = await crearTenantDePrueba();
  const app = express();
  app.use(lecturaComprobantesRouter);
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
  generateObject.mockReset();
  generateObject.mockResolvedValue({ object: leido() });
  conSesion(tenant.tenantId);
});

describe("quién puede leer", () => {
  it("sin sesión no lee, y no llama al modelo", async () => {
    resolverSesion.mockResolvedValue(null);
    const r = await leer();
    expect(r.estado).toBe(401);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("no recibe el archivo de un desconocido: la sesión se mira primero", async () => {
    // Un archivo MÁS GRANDE que el tope, sin sesión. Si contesta 401, multer
    // nunca corrió. Si contestara 413, el servidor se habría tragado once
    // megas de alguien a quien todavía no identificó, que es exactamente la
    // forma más barata de tirarlo abajo.
    //
    // Es la única manera de probar el orden: con un archivo chico, los dos
    // órdenes contestan 401 igual.
    resolverSesion.mockResolvedValue(null);
    const enorme = new Uint8Array(11 * 1024 * 1024);
    enorme.set(PDF);

    const r = await leer({ bytes: enorme }).catch(() => ({ estado: "la conexión se cortó" }));
    expect(r.estado).toBe(401);
  });

  it("un rol de solo lectura no dispara una lectura paga", async () => {
    conSesion(tenant.tenantId, "solo_lectura");
    const r = await leer();
    expect(r.estado).toBe(403);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("una sesión sin rol tampoco", async () => {
    resolverSesion.mockResolvedValue({ activeOrganizationId: tenant.tenantId, usuarioId: "u1" });
    expect((await leer()).estado).toBe(403);
  });
});

describe("qué se acepta", () => {
  it("rechaza un archivo que no es lo que dice ser", async () => {
    // Llega con nombre .pdf y Content-Type de PDF: las dos cosas las elige
    // quien sube el archivo. Lo que no se puede falsear son los primeros bytes.
    const r = await leer({ bytes: HTML_DISFRAZADO });
    expect(r.estado).toBe(415);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("sin archivo no hay nada que leer", async () => {
    expect((await leer({ sinArchivo: true })).estado).toBe(400);
  });

  it("exige saber si es una compra o una venta", async () => {
    expect((await leer({ tipo: null })).estado).toBe(400);
    expect((await leer({ tipo: "cualquiera" })).estado).toBe(400);
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe("qué devuelve", () => {
  it("una compra trae al proveedor que ya está cargado", async () => {
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    const proveedor = await crearProveedor(propio, {
      razonSocial: "Proveedora SA",
      cuit: "30716644495",
      condicionIva: "responsable_inscripto",
      condicionPagoDias: 30,
    });

    const r = await leer();
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ tipo: "compra", contraparteId: proveedor.id });
  });

  it("si el CUIT no está cargado, la contraparte viene vacía", async () => {
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    const r = await leer();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.contraparteId).toBeNull();
  });

  it("una venta se interpreta como venta, no como compra", async () => {
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    const r = await leer({ tipo: "venta" });
    expect(r.cuerpo.tipo).toBe("venta");
    // La propuesta de una venta mira al receptor; la de una compra, al emisor.
    expect(r.cuerpo.propuesta).toMatchObject({ receptorCuit: "30692138747" });
  });

  it("devuelve el nombre y el hash del archivo, pero no el archivo", async () => {
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    const r = await leer({ nombre: "mi-factura.pdf" });
    const archivo = r.cuerpo.archivo as { nombre: string; hash: string };
    expect(archivo.nombre).toBe("mi-factura.pdf");
    expect(archivo.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r.cuerpo)).not.toContain("%PDF");
  });
});

describe("cuando algo falla", () => {
  it("si el modelo se cae, lo dice sin filtrar el error", async () => {
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    generateObject.mockRejectedValue(new Error("rate limit: key sk-abc123"));

    const r = await leer();
    expect(r.estado).toBe(502);
    // El mensaje del proveedor puede traer la key o detalles de la cuenta.
    expect(JSON.stringify(r.cuerpo)).not.toContain("sk-abc123");
  });

  it("corta cuando se agota el cupo del día", async () => {
    // El tope de este archivo es 2, y es por empresa: una empresa que lo agota
    // no deja sin leer a las demás.
    const propio = await crearTenantDePrueba();
    conSesion(propio.tenantId);
    expect((await leer()).estado).toBe(200);
    expect((await leer()).estado).toBe(200);

    const tercera = await leer();
    expect(tercera.estado).toBe(429);
    expect(generateObject).toHaveBeenCalledTimes(2);

    const otra = await crearTenantDePrueba();
    conSesion(otra.tenantId);
    expect((await leer()).estado).toBe(200);
  });
});
