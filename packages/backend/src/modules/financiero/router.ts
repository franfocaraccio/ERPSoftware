import { router, tenantProcedure } from "../../trpc/trpc.js";
import { puedeVerPanel } from "../equipo/service.js";
import { resumenFinanciero } from "./service.js";

export const financieroRouter = router({
  /**
   * Todo lo que necesita el dashboard en una sola consulta.
   *
   * El acceso a los indicadores es por persona (lo administra el slice de
   * equipo). Cuando no lo tiene, la respuesta lo dice y no trae datos: la
   * verificación es del servidor, no de la UI, porque esconder el ítem del menú
   * no impide llamar al endpoint.
   *
   * No tirar error: para esa persona "sin indicadores" es un estado normal de
   * la pantalla, no una falla.
   */
  resumen: tenantProcedure.query(async ({ ctx }) => {
    if (!(await puedeVerPanel(ctx.tenantId, ctx.usuarioId))) {
      return { habilitado: false as const };
    }
    return { habilitado: true as const, ...(await resumenFinanciero(ctx)) };
  }),
});
