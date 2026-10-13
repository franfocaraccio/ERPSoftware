import { hoyEnArgentina } from "@erp/core/dates";
import { TRPCError } from "@trpc/server";
import { fromNodeHeaders } from "better-auth/node";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { resolverSesion } from "../../trpc/context.js";
import { explicacionHabilitada } from "../explicacion/service.js";
import { armarInforme, InformeNoDisponibleError, mesAnterior } from "./datos.js";
import { dibujarInforme, nombreDelMes } from "./pdf.js";

/**
 * El informe ejecutivo mensual, en PDF.
 *
 * Ruta de Express y no de tRPC porque devuelve un archivo, no JSON. Se
 * genera en el momento y no se guarda: cada descarga lee los datos de ese
 * instante.
 */

export const informesRouter: express.Router = express.Router();

const consultaSchema = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido (AAAA-MM)")
    .optional(),
});

informesRouter.get("/api/informes/mensual", async (req: Request, res: Response) => {
  const consulta = consultaSchema.safeParse(req.query);
  if (!consulta.success) {
    res.status(400).json({ error: consulta.error.issues[0]?.message ?? "Consulta inválida." });
    return;
  }

  // La misma sesión que tRPC, incluido el token de un link de solo lectura.
  const headers = fromNodeHeaders(req.headers);
  const sesion = await resolverSesion(headers);
  if (!sesion?.activeOrganizationId) {
    res.status(401).json({ error: "Sesión no válida." });
    return;
  }

  const hoy = hoyEnArgentina();
  const periodo = consulta.data.periodo ?? mesAnterior(hoy.slice(0, 7));

  try {
    const informe = await armarInforme({ session: sesion, headers }, periodo, hoy, {
      conLectura: explicacionHabilitada(),
    });
    const pdf = await dibujarInforme(informe);
    const nombre = `informe-${periodo}.pdf`;
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `attachment; filename="${nombre}"`)
      .set("Cache-Control", "no-store")
      .send(pdf);
    console.log(
      `[informes] tenant=${sesion.activeOrganizationId} periodo=${periodo} (${nombreDelMes(periodo)}) ${pdf.length} bytes`,
    );
  } catch (error) {
    if (error instanceof InformeNoDisponibleError) {
      res.status(error.sinPermiso ? 403 : 422).json({ error: error.message });
      return;
    }
    if (
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ) {
      res.status(403).json({ error: "Tu acceso no incluye todo lo que lleva el informe." });
      return;
    }
    console.error("[informes] No se pudo generar el informe:", error);
    res.status(500).json({ error: "No se pudo generar el informe. Probá de nuevo." });
  }
});
