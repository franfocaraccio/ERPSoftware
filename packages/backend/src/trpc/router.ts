import { clientesRouter } from "../modules/clientes/router.js";
import { comprobantesRouter } from "../modules/comprobantes/router.js";
import { impuestosRouter } from "../modules/impuestos/router.js";
import { invitacionesRouter } from "../modules/invitaciones/router.js";
import { plataformaRouter } from "../modules/plataforma/router.js";
import { proveedoresRouter } from "../modules/proveedores/router.js";
import { stockRouter } from "../modules/stock/router.js";
import { tesoreriaRouter } from "../modules/tesoreria/router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  clientes: clientesRouter,
  comprobantes: comprobantesRouter,
  impuestos: impuestosRouter,
  invitaciones: invitacionesRouter,
  plataforma: plataformaRouter,
  proveedores: proveedoresRouter,
  stock: stockRouter,
  tesoreria: tesoreriaRouter,
});

export type AppRouter = typeof appRouter;
