import { router, tenantProcedure } from "../../trpc/trpc.js";
import { resumenFinanciero } from "./service.js";

export const financieroRouter = router({
  /** Todo lo que necesita el dashboard en una sola consulta. */
  resumen: tenantProcedure.query(({ ctx }) => resumenFinanciero(ctx)),
});
