import { auditLog } from "./schema/auditoria.js";
import type { TenantTx } from "./tenant-db.js";

export interface Actor {
  tenantId: string;
  usuarioId: string;
}

type Accion = (typeof auditLog.accion.enumValues)[number];

/**
 * Registra una operación en el audit log. Regla dura: toda operación que
 * impacte saldos, stock o impuestos deja rastro. Se llama SIEMPRE dentro de
 * la misma transacción que la operación auditada, para que no puedan divergir.
 */
export function auditar(
  tx: TenantTx,
  actor: Actor,
  entrada: {
    tabla: string;
    registroId: string;
    accion: Accion;
    detalle?: unknown;
  },
) {
  return tx.insert(auditLog).values({
    tenantId: actor.tenantId,
    usuarioId: actor.usuarioId,
    tabla: entrada.tabla,
    registroId: entrada.registroId,
    accion: entrada.accion,
    detalle: entrada.detalle ?? null,
  });
}
