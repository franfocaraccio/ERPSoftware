import { clientesRouter } from "../modules/clientes/router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  clientes: clientesRouter,
});

export type AppRouter = typeof appRouter;
