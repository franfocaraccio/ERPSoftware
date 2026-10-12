import { router, tenantProcedure } from "../../trpc/trpc.js";
import { cotizacionesDolar } from "./dolar.js";

export const cotizacionesRouter = router({
  /**
   * Dólar oficial y blue, con sus dos puntas y la variación del día. Va detrás
   * de `tenantProcedure` aunque el dato sea público: no hay razón para que un
   * endpoint nuestro salga a internet por pedido de alguien sin sesión.
   */
  dolar: tenantProcedure.query(() => cotizacionesDolar()),
});
