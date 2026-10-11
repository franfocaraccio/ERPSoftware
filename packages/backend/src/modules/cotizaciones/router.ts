import { router, tenantProcedure } from "../../trpc/trpc.js";
import { dolarOficial } from "./bcra.js";

export const cotizacionesRouter = router({
  /**
   * Dólar oficial del BCRA. Va detrás de `tenantProcedure` aunque el dato sea
   * público: no hay razón para que un endpoint nuestro salga a internet por
   * pedido de alguien que no inició sesión.
   */
  dolar: tenantProcedure.query(() => dolarOficial()),
});
