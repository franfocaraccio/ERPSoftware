import { inArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { TenantTx } from "../../db/tenant-db.js";

export class ReferenciaAjenaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ReferenciaAjenaError";
  }
}

/**
 * Que cada id que llegó del cliente apunte a una fila de esta empresa.
 *
 * La clave foránea no alcanza: Postgres la verifica **sin aplicar RLS**, así
 * que acepta el id de una fila de otra empresa. Esta consulta, en cambio,
 * corre dentro de `withTenant` y sólo encuentra las propias. Sin ella, una
 * empresa puede colgar sus filas de las de otra: no las ve, pero las ata (y,
 * por ejemplo, le impide borrarlas).
 *
 * Los nulos y repetidos se ignoran.
 */
export async function exigirPropios(
  tx: TenantTx,
  tabla: PgTable,
  columnaId: AnyPgColumn,
  ids: readonly (string | null | undefined)[],
  /** Lo que ve el usuario si falla: "Cliente no encontrado". */
  mensaje: string,
): Promise<void> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))];
  if (unicos.length === 0) {
    return;
  }
  const encontrados = await tx
    .select({ id: columnaId })
    .from(tabla)
    .where(inArray(columnaId, unicos));
  if (encontrados.length !== unicos.length) {
    throw new ReferenciaAjenaError(mensaje);
  }
}
