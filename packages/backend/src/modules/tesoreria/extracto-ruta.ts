import { createHash } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ROLES_ESCRITURA } from "../../auth/roles.js";
import { resolverSesion } from "../../trpc/context.js";
import { ReferenciaAjenaError } from "../_comunes/pertenencia.js";
import { proponerConciliacion } from "./conciliacion.js";
import { ExtractoNoReconocidoError, interpretarExtracto } from "./extracto.js";
import { ArchivoNoLegibleError, leerHojaXlsx } from "./xlsx.js";

/**
 * Subir un extracto bancario y recibir la propuesta de conciliación.
 *
 * Va por Express y no por tRPC porque recibe un archivo. Confirmar, en
 * cambio, va por tRPC: lo que viaja ahí son decisiones, que son JSON.
 *
 * El archivo no se guarda. Se lee, se propone y se descarta; lo que vuelve es
 * su hash, para que la confirmación diga de qué archivo salió cada línea.
 */

/**
 * 5 MB. El extracto real de seis meses de Galicia pesa 10 KB, así que esto
 * sobra; el tope está para que una subida no sea una forma de llenarle la
 * memoria al servidor. Lo que se descomprime adentro tiene su propio tope.
 */
const TOPE_BYTES = 5 * 1024 * 1024;

const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TOPE_BYTES, files: 1 },
}).single("archivo");

const cuentaSchema = z.uuid();

export const extractoRouter: express.Router = express.Router();

extractoRouter.post("/api/tesoreria/extracto", manejarExtracto);

async function manejarExtracto(req: Request, res: Response): Promise<void> {
  // La sesión y el rol se miran ANTES de recibir el archivo: nadie sube cinco
  // megas a la memoria del servidor sin estar identificado.
  const sesion = await resolverSesion(fromNodeHeaders(req.headers));
  if (!sesion?.activeOrganizationId) {
    res.status(401).json({ error: "Sesión no válida." });
    return;
  }
  // Conciliar crea y marca movimientos: es una acción de escritura.
  if (!sesion.rolOrganizacion || !ROLES_ESCRITURA.includes(sesion.rolOrganizacion)) {
    res.status(403).json({ error: "Tu rol no permite conciliar cuentas." });
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

  const cuenta = cuentaSchema.safeParse(req.body?.cuentaId);
  if (!cuenta.success) {
    res.status(400).json({ error: "Elegí la cuenta a la que pertenece el extracto." });
    return;
  }

  const actor = { tenantId: sesion.activeOrganizationId, usuarioId: sesion.usuarioId };
  try {
    const extracto = interpretarExtracto(leerHojaXlsx(archivo.buffer));
    const propuesta = await proponerConciliacion(actor, cuenta.data, extracto);
    res.json({
      ...propuesta,
      archivo: {
        nombre: archivo.originalname,
        hash: createHash("sha256").update(archivo.buffer).digest("hex"),
      },
    });
  } catch (e) {
    // El archivo no es un Excel, o es un Excel que no es un extracto: el
    // mensaje es para la persona y explica qué esperaba encontrar.
    if (e instanceof ArchivoNoLegibleError) {
      res.status(415).json({ error: e.message });
      return;
    }
    if (e instanceof ExtractoNoReconocidoError) {
      res.status(422).json({ error: e.message });
      return;
    }
    if (e instanceof ReferenciaAjenaError) {
      res.status(404).json({ error: e.message });
      return;
    }
    console.error("[extracto] No se pudo procesar el extracto:", e);
    res.status(500).json({ error: "No se pudo procesar el extracto." });
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
        resolver({ estado: 413, mensaje: "El archivo supera los 5 MB." });
        return;
      }
      resolver({ estado: 400, mensaje: "No se pudo recibir el archivo." });
    });
  });
}
