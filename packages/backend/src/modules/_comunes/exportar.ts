import { auditLog } from "../../db/schema/auditoria.js";
import { withTenant } from "../../db/tenant-db.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

/**
 * Tope de filas por exportación.
 *
 * No es una restricción de producto sino de memoria: la consulta trae todo a
 * un array, viaja por JSON y el navegador lo convierte en planilla. Sin tope,
 * una empresa grande tira el contenedor. Si alguien lo alcanza de verdad, lo
 * que corresponde es que filtre, no subir el número a ciegas.
 */
export const TOPE_FILAS_EXPORT = 5000;

/**
 * Deja rastro de una exportación.
 *
 * No modifica nada, pero llevarse el padrón completo de clientes con CUITs y
 * datos de contacto es exactamente el movimiento que uno quiere poder
 * reconstruir después. Va sin `registroId` porque no es una fila: es un
 * conjunto, y los filtros que lo definen quedan en el detalle.
 */
async function auditarExportacion(
  actor: Actor,
  entrada: { tabla: string; filas: number; truncado: boolean; filtros: unknown },
): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: entrada.tabla,
      accion: "exportacion",
      detalle: { filas: entrada.filas, truncado: entrada.truncado, filtros: entrada.filtros },
    });
  });
}

/**
 * Trae un listado completo para exportar y deja el rastro.
 *
 * Envuelve al mismo service que usa la pantalla, sin recalcular nada: las
 * columnas derivadas (saldo, margen, próximo vencimiento) se computan al leer,
 * y si el export las armara por su cuenta, la planilla y la pantalla podrían
 * contradecirse sin que nadie sepa cuál está bien.
 *
 * `truncado` avisa que hay más filas de las que entraron en el tope, para que
 * la UI lo diga en vez de entregar un archivo incompleto con cara de completo.
 */
export async function exportarListado<T>(
  actor: Actor,
  entrada: { tabla: string; filtros: Record<string, unknown> },
  traer: () => Promise<{ items: T[]; total: number }>,
): Promise<{ items: T[]; total: number; truncado: boolean }> {
  const { items, total } = await traer();
  const truncado = total > items.length;

  await auditarExportacion(actor, {
    tabla: entrada.tabla,
    filas: items.length,
    truncado,
    filtros: sinPaginacion(entrada.filtros),
  });

  return { items, total, truncado };
}

/**
 * Saca `pagina` y `tamanoPagina` de lo que se registra.
 *
 * El input reusa el schema del listado, así que Zod les pone sus defaults
 * —`tamanoPagina: 20`, por ejemplo— aunque la exportación los ignore y traiga
 * hasta el tope. Guardarlos haría creer, al leer el historial, que se llevaron
 * 20 filas cuando se llevaron todas.
 */
function sinPaginacion(filtros: Record<string, unknown>): Record<string, unknown> {
  const { pagina: _p, tamanoPagina: _t, ...resto } = filtros;
  return resto;
}
