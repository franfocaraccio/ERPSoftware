import { auditoriaRouter } from "../modules/auditoria/router.js";
import { clientesRouter } from "../modules/clientes/router.js";
import { comprobantesRouter } from "../modules/comprobantes/router.js";
import { consolidadoRouter } from "../modules/consolidado/router.js";
import { cotizacionesRouter } from "../modules/cotizaciones/router.js";
import { cuentaCorrienteRouter } from "../modules/cuenta-corriente/router.js";
import { equipoRouter } from "../modules/equipo/router.js";
import { explicacionRouter } from "../modules/explicacion/router.js";
import { financieroRouter } from "../modules/financiero/router.js";
import { impuestosRouter } from "../modules/impuestos/router.js";
import { invitacionesRouter } from "../modules/invitaciones/router.js";
import { parametrosRouter } from "../modules/parametros/router.js";
import { plataformaRouter } from "../modules/plataforma/router.js";
import { proveedoresRouter } from "../modules/proveedores/router.js";
import { resultadosRouter } from "../modules/resultados/router.js";
import { stockRouter } from "../modules/stock/router.js";
import { tesoreriaRouter } from "../modules/tesoreria/router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  auditoria: auditoriaRouter,
  clientes: clientesRouter,
  comprobantes: comprobantesRouter,
  consolidado: consolidadoRouter,
  cotizaciones: cotizacionesRouter,
  cuentaCorriente: cuentaCorrienteRouter,
  equipo: equipoRouter,
  explicacion: explicacionRouter,
  financiero: financieroRouter,
  impuestos: impuestosRouter,
  invitaciones: invitacionesRouter,
  parametros: parametrosRouter,
  plataforma: plataformaRouter,
  proveedores: proveedoresRouter,
  resultados: resultadosRouter,
  stock: stockRouter,
  tesoreria: tesoreriaRouter,
});

export type AppRouter = typeof appRouter;
