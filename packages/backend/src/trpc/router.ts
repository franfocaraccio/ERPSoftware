import { clientesRouter } from "../modules/clientes/router.js";
import { proveedoresRouter } from "../modules/proveedores/router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  clientes: clientesRouter,
  proveedores: proveedoresRouter,
});

export type AppRouter = typeof appRouter;
