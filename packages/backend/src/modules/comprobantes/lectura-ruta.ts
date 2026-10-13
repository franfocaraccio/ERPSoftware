import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { resolverSesion } from "../../trpc/context.js";
import { detectarTipo, TIPOS_PERMITIDOS } from "../_comunes/tipo-archivo.js";
import { crearContador } from "../asistente/limite.js";
import { buscarProveedorPorCuit } from "../proveedores/service.js";
import {
  type CompraPropuesta,
  comprobanteLeidoSchema,
  INSTRUCCIONES,
  interpretar,
} from "./lectura.js";

/**
 * Leer una factura de proveedor de un archivo.
 *
 * Va por una ruta de Express y no por tRPC porque tRPC habla JSON y esto
 * recibe un archivo. Es el mismo motivo por el que el asistente tiene su
 * propia ruta.
 *
 * **El archivo no se guarda en ninguna parte.** Entra en memoria, se lee, y lo
 * único que sobrevive es su nombre y su hash en el audit log, para poder
 * reconocer que un archivo ya se procesó sin conservarlo.
 */

/** 10 MB: una foto de celular de una factura pesa 3 o 4. */
const TOPE_BYTES = 10 * 1024 * 1024;

const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TOPE_BYTES, files: 1 },
}).single("archivo");

/**
 * Un modelo que lee un papel escaneado tiene que ver el papel: el mini que usa
 * el asistente alcanza para resumir un manual, no para encontrar el total en
 * una factura torcida. Se deja configurable para poder bajarlo si el gasto
 * molesta.
 */
const MODELO = process.env.LECTURA_MODELO ?? "gpt-5.4";

/**
 * Tope propio, separado del asistente.
 *
 * Leer una factura cuesta bastante más que una pregunta de chat —entra una
 * imagen entera— así que comparten el mecanismo pero no el contador: que
 * alguien agote el chat no puede dejar sin leer facturas, ni al revés.
 */
const consumirCupoLectura = crearContador({
  limite: Number(process.env.LECTURA_LIMITE_DIARIO ?? 50),
});

export const lecturaComprobantesRouter: express.Router = express.Router();

lecturaComprobantesRouter.post("/api/comprobantes/leer", manejarLectura);

interface RespuestaLectura {
  propuesta: CompraPropuesta;
  /** El proveedor que coincide con el CUIT leído, si ya está cargado. */
  proveedorId: string | null;
  archivo: { nombre: string; hash: string };
}

async function manejarLectura(req: Request, res: Response): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "La lectura de comprobantes no está configurada." });
    return;
  }

  // La sesión se resuelve ANTES de tocar el archivo: nadie sube diez megas a
  // la memoria del servidor sin estar autenticado.
  const sesion = await resolverSesion(fromNodeHeaders(req.headers));
  if (!sesion?.activeOrganizationId) {
    res.status(401).json({ error: "Sesión no válida." });
    return;
  }

  const error = await enMemoria(req, res);
  if (error) {
    res.status(error.estado).json({ error: error.mensaje });
    return;
  }

  const archivo = req.file;
  if (!archivo) {
    res.status(400).json({ error: "Falta el archivo." });
    return;
  }

  // El tipo sale del contenido, no de la extensión ni del Content-Type: los
  // dos los elige quien sube el archivo.
  const tipo = detectarTipo(archivo.buffer);
  if (tipo === null) {
    res.status(415).json({
      error: `El archivo no es ninguno de los formatos que se pueden leer (${TIPOS_PERMITIDOS.join(", ")}).`,
    });
    return;
  }

  const cupo = consumirCupoLectura(sesion.activeOrganizationId);
  if (!cupo.permitido) {
    res.status(429).json({
      error: `Llegaste al límite de ${cupo.limite} lecturas por día. Se renueva mañana.`,
    });
    return;
  }

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      schema: comprobanteLeidoSchema,
      system: INSTRUCCIONES,
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: archivo.buffer, mediaType: tipo },
            { type: "text", text: "Leé este comprobante." },
          ],
        },
      ],
    });

    const propuesta = interpretar(object);
    const proveedorId =
      propuesta.emisorCuit === null
        ? null
        : await buscarProveedorPorCuit(
            { tenantId: sesion.activeOrganizationId, usuarioId: sesion.usuarioId },
            propuesta.emisorCuit,
          );

    const respuesta: RespuestaLectura = {
      propuesta,
      proveedorId,
      archivo: {
        nombre: archivo.originalname,
        hash: createHash("sha256").update(archivo.buffer).digest("hex"),
      },
    };
    res.json(respuesta);
  } catch (e) {
    console.error("[lectura] No se pudo leer el comprobante:", e);
    res.status(502).json({
      error: "No se pudo leer el comprobante. Probá de nuevo o cargalo a mano.",
    });
  }
}

/** Corre multer como promesa, traduciendo sus errores a algo que se entienda. */
function enMemoria(
  req: Request,
  res: Response,
): Promise<{ estado: number; mensaje: string } | null> {
  return new Promise((resolver) => {
    recibirArchivo(req, res, (e: unknown) => {
      if (!e) {
        resolver(null);
        return;
      }
      if (e instanceof multer.MulterError && e.code === "LIMIT_FILE_SIZE") {
        resolver({ estado: 413, mensaje: "El archivo supera los 10 MB." });
        return;
      }
      resolver({ estado: 400, mensaje: "No se pudo recibir el archivo." });
    });
  });
}
