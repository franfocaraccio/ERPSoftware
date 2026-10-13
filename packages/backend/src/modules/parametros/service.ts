import { eq } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { parametros } from "../../db/schema/parametros.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import type { ParametrosGuardar } from "./schema.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

export interface Parametros {
  umbralMoraDias: number;
  margenObjetivo: string | null;
  minimoOperativo: string | null;
  umbralConcentracion: string;
  regimenFiscal: "responsable_inscripto" | "monotributo";
  diaVencimientoIva: number;
}

/**
 * Valores de arranque cuando la empresa todavía no configuró los suyos.
 *
 * Los umbrales de mora y de concentración tienen default porque sin ellos no
 * se puede pintar el semáforo del DSO ni el de cartera; el margen objetivo y
 * el mínimo operativo quedan nulos a propósito: inventados por nosotros harían
 * que el panel muestre alertas que no significan nada.
 */
export const POR_DEFECTO: Parametros = {
  umbralMoraDias: 60,
  margenObjetivo: null,
  minimoOperativo: null,
  umbralConcentracion: "20.00",
  regimenFiscal: "responsable_inscripto",
  diaVencimientoIva: 20,
};

/**
 * Lee los umbrales dentro de una transacción ya abierta.
 *
 * Es la versión que usan los módulos que están adentro de su propio
 * `withTenant` y no pueden abrir otro. `obtenerParametros` es esta misma
 * función con la transacción puesta.
 */
export async function leerParametros(tx: TenantTx, tenantId: string): Promise<Parametros> {
  const [fila] = await tx
    .select()
    .from(parametros)
    .where(eq(parametros.tenantId, tenantId))
    .limit(1);
  if (!fila) {
    return POR_DEFECTO;
  }
  return {
    umbralMoraDias: fila.umbralMoraDias,
    margenObjetivo: fila.margenObjetivo,
    minimoOperativo: fila.minimoOperativo,
    umbralConcentracion: fila.umbralConcentracion,
    regimenFiscal: fila.regimenFiscal,
    diaVencimientoIva: fila.diaVencimientoIva,
  };
}

export async function obtenerParametros(actor: Actor): Promise<Parametros> {
  return withTenant(actor.tenantId, (tx) => leerParametros(tx, actor.tenantId));
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
      umbralConcentracion: datos.umbralConcentracion,
      regimenFiscal: datos.regimenFiscal ?? existente?.regimenFiscal ?? POR_DEFECTO.regimenFiscal,
      diaVencimientoIva:
        datos.diaVencimientoIva ?? existente?.diaVencimientoIva ?? POR_DEFECTO.diaVencimientoIva,
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
              umbralConcentracion: existente.umbralConcentracion,
              regimenFiscal: existente.regimenFiscal,
              diaVencimientoIva: existente.diaVencimientoIva,
            }
          : null,
        despues: valores,
      },
    });

    return {
      umbralMoraDias: guardado.umbralMoraDias,
      margenObjetivo: guardado.margenObjetivo,
      minimoOperativo: guardado.minimoOperativo,
      umbralConcentracion: guardado.umbralConcentracion,
      regimenFiscal: guardado.regimenFiscal,
      diaVencimientoIva: guardado.diaVencimientoIva,
    };
  });
}
