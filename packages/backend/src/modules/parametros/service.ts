import { eq } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { parametros } from "../../db/schema/parametros.js";
import { withTenant } from "../../db/tenant-db.js";
import type { ParametrosGuardar } from "./schema.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

export interface Parametros {
  umbralMoraDias: number;
  margenObjetivo: string | null;
  minimoOperativo: string | null;
}

/**
 * Valores de arranque cuando la empresa todavía no configuró los suyos.
 *
 * El umbral de mora tiene default porque sin él no se puede pintar el semáforo
 * del DSO; los otros dos quedan nulos a propósito: un margen objetivo o un
 * mínimo de caja inventados por nosotros harían que el panel muestre alertas
 * que no significan nada.
 */
export const POR_DEFECTO: Parametros = {
  umbralMoraDias: 60,
  margenObjetivo: null,
  minimoOperativo: null,
};

export async function obtenerParametros(actor: Actor): Promise<Parametros> {
  return withTenant(actor.tenantId, async (tx) => {
    const [fila] = await tx
      .select()
      .from(parametros)
      .where(eq(parametros.tenantId, actor.tenantId))
      .limit(1);
    if (!fila) {
      return POR_DEFECTO;
    }
    return {
      umbralMoraDias: fila.umbralMoraDias,
      margenObjetivo: fila.margenObjetivo,
      minimoOperativo: fila.minimoOperativo,
    };
  });
}

/** Una fila por empresa: si no existe se crea, si existe se pisa. */
export async function guardarParametros(
  actor: Actor,
  datos: ParametrosGuardar,
): Promise<Parametros> {
  return withTenant(actor.tenantId, async (tx) => {
    const [existente] = await tx
      .select()
      .from(parametros)
      .where(eq(parametros.tenantId, actor.tenantId))
      .limit(1);

    const valores = {
      umbralMoraDias: datos.umbralMoraDias,
      margenObjetivo: datos.margenObjetivo,
      minimoOperativo: datos.minimoOperativo,
    };

    const [guardado] = existente
      ? await tx.update(parametros).set(valores).where(eq(parametros.id, existente.id)).returning()
      : await tx
          .insert(parametros)
          .values({ tenantId: actor.tenantId, ...valores })
          .returning();

    if (!guardado) {
      throw new Error("No se pudieron guardar los parámetros");
    }

    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "parametros",
      registroId: guardado.id,
      accion: existente ? "modificacion" : "alta",
      detalle: {
        antes: existente
          ? {
              umbralMoraDias: existente.umbralMoraDias,
              margenObjetivo: existente.margenObjetivo,
              minimoOperativo: existente.minimoOperativo,
            }
          : null,
        despues: valores,
      },
    });

    return {
      umbralMoraDias: guardado.umbralMoraDias,
      margenObjetivo: guardado.margenObjetivo,
      minimoOperativo: guardado.minimoOperativo,
    };
  });
}
