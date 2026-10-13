import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ROLES_ESCRITURA } from "../../auth/roles.js";
import { resolverSesion } from "../../trpc/context.js";
import { detectarTipo, TIPOS_PERMITIDOS } from "../_comunes/tipo-archivo.js";
import { crearContador } from "../asistente/limite.js";
import { buscarClientePorCuit } from "../clientes/service.js";
import { buscarProveedorPorCuit } from "../proveedores/service.js";
import {
  type CompraPropuesta,
  comprobanteLeidoSchema,
  INSTRUCCIONES,
  interpretar,
  interpretarVenta,
  type VentaPropuesta,
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

/** Los dos lados del mostrador; cualquier otra cosa es un pedido mal armado. */
const tipoSchema = z.enum(["compra", "venta"]);

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

/**
 * La misma lectura sirve para los dos lados del mostrador, pero lo que se
 * arma con ella no: una compra transcribe los totales del papel ajeno, una
 * venta los recalcula de los ítems. Por eso el tipo viene en el pedido y hay
 * dos interpretaciones, no un `if` adentro de una.
 */
type TipoComprobante = "compra" | "venta";

interface RespuestaCompra {
  tipo: "compra";
  propuesta: CompraPropuesta;
  /** El proveedor que coincide con el CUIT leído, si ya está cargado. */
  contraparteId: string | null;
  archivo: { nombre: string; hash: string };
}

interface RespuestaVenta {
  tipo: "venta";
  propuesta: VentaPropuesta;
  /** El cliente que coincide con el CUIT leído, si ya está cargado. */
  contraparteId: string | null;
  archivo: { nombre: string; hash: string };
}

type RespuestaLectura = RespuestaCompra | RespuestaVenta;

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
  // Leer una factura es para cargarla: una acción de escritura. Sin esto, un
  // miembro de solo lectura o un link de solo lectura disparaban lecturas
  // pagas que después no podían guardar.
  if (!sesion.rolOrganizacion || !ROLES_ESCRITURA.includes(sesion.rolOrganizacion)) {
    res.status(403).json({ error: "Tu rol no permite cargar comprobantes." });
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

  const tipoParseado = tipoSchema.safeParse(req.body?.tipo);
  if (!tipoParseado.success) {
    res.status(400).json({ error: "Decí si es una compra o una venta." });
    return;
  }
  const tipo_: TipoComprobante = tipoParseado.data;

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

    const actor = { tenantId: sesion.activeOrganizationId, usuarioId: sesion.usuarioId };
    const archivoLeido = {
      nombre: archivo.originalname,
      hash: createHash("sha256").update(archivo.buffer).digest("hex"),
    };

    // En una compra la contraparte es el emisor —el proveedor nos factura—; en
    // una venta es el receptor. Es el mismo papel leído desde el otro lado.
    if (tipo_ === "venta") {
      const propuesta = interpretarVenta(object);
      const contraparteId =
        propuesta.receptorCuit === null
          ? null
          : await buscarClientePorCuit(actor, propuesta.receptorCuit);
      res.json({ tipo: "venta", propuesta, contraparteId, archivo: archivoLeido });
      return;
    }

    const propuesta = interpretar(object);
    const contraparteId =
      propuesta.emisorCuit === null
        ? null
        : await buscarProveedorPorCuit(actor, propuesta.emisorCuit);
    res.json({ tipo: "compra", propuesta, contraparteId, archivo: archivoLeido });
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
