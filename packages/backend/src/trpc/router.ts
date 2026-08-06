import { clientesRouter } from "../modules/clientes/router.js";
import { impuestosRouter } from "../modules/impuestos/router.js";
import { proveedoresRouter } from "../modules/proveedores/router.js";
import { stockRouter } from "../modules/stock/router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  clientes: clientesRouter,
  impuestos: impuestosRouter,
  proveedores: proveedoresRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
