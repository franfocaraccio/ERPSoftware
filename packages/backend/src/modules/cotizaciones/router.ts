import { router, tenantProcedure } from "../../trpc/trpc.js";
import { dolarOficial } from "./dolar.js";

export const cotizacionesRouter = router({
  /**
   * Dólar oficial, con compra y venta. Va detrás de `tenantProcedure` aunque el
   * dato sea público: no hay razón para que un endpoint nuestro salga a
   * internet por pedido de alguien que no inició sesión.
   */
  dolar: tenantProcedure.query(() => dolarOficial()),
});
