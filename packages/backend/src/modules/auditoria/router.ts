import { administradorProcedure, router } from "../../trpc/trpc.js";
import { auditoriaListarSchema, MODULOS_AUDITABLES } from "./schema.js";
import { listarAuditoria } from "./service.js";

/**
 * Historial de la empresa. Es del Administrador: dice quién tocó qué y cuándo,
 * y el snapshot del antes y el después de cada cambio.
 *
 * Lo que ve es solo lo de su propia empresa. Nuestras operaciones desde el
 * panel de plataforma —alta de la empresa, invitación al primer
 * Administrador— **no** se escriben acá y no tienen que escribirse: son de la
 * plataforma, no de la PyME. Si algún día hace falta auditarlas, van a un
 * registro aparte.
 */
export const auditoriaRouter = router({
  listar: administradorProcedure
    .input(auditoriaListarSchema)
    .query(({ ctx, input }) => listarAuditoria(ctx, input)),

  /** Módulos con los que se arma el filtro, para no duplicarlos en la UI. */
  modulos: administradorProcedure.query(() =>
    Object.entries(MODULOS_AUDITABLES).map(([id, { etiqueta }]) => ({ id, etiqueta })),
  ),
});
