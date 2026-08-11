import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { user } from "../../db/schema/auth.js";
import { withTenant } from "../../db/tenant-db.js";
import { filtroRangoInstante } from "../_comunes/fechas.js";
import { type AuditoriaListar, MODULOS_AUDITABLES, type ModuloAuditable } from "./schema.js";

interface Actor {
  tenantId: string;
}

export interface EntradaAuditoria {
  id: string;
  fecha: Date;
  /** Nombre de quien lo hizo; null cuando lo hizo un proceso automático. */
  autor: string | null;
  autorEmail: string | null;
  modulo: ModuloAuditable | null;
  tabla: string;
  accion: string;
  registroId: string | null;
  detalle: unknown;
}

/** De qué módulo es cada tabla, para no recorrer el mapa en cada fila. */
const MODULO_DE_TABLA = new Map<string, ModuloAuditable>(
  Object.entries(MODULOS_AUDITABLES).flatMap(([modulo, { tablas }]) =>
    tablas.map((t) => [t, modulo as ModuloAuditable] as const),
  ),
);

export async function listarAuditoria(
  actor: Actor,
  input: AuditoriaListar,
): Promise<{ items: EntradaAuditoria[]; total: number }> {
  return withTenant(actor.tenantId, async (tx) => {
    const condiciones: SQL[] = [];

    const rango = filtroRangoInstante(auditLog.fecha, input);
    if (rango) {
      condiciones.push(rango);
    }
    if (input.modulo) {
      condiciones.push(inArray(auditLog.tabla, [...MODULOS_AUDITABLES[input.modulo].tablas]));
    }
    if (input.usuarioId) {
      condiciones.push(eq(auditLog.usuarioId, input.usuarioId));
    }

    const filtro = condiciones.length > 0 ? and(...condiciones) : undefined;

    const filas = await tx
      .select({
        id: auditLog.id,
        fecha: auditLog.fecha,
        usuarioId: auditLog.usuarioId,
        autor: user.name,
        autorEmail: user.email,
        tabla: auditLog.tabla,
        accion: auditLog.accion,
        registroId: auditLog.registroId,
        detalle: auditLog.detalle,
      })
      .from(auditLog)
      // leftJoin y no innerJoin: los jobs escriben sin usuario, y si alguien
      // fue borrado su rastro tiene que seguir estando.
      .leftJoin(user, eq(user.id, auditLog.usuarioId))
      .where(filtro)
      .orderBy(desc(auditLog.fecha))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const [fila] = await tx.select({ total: count() }).from(auditLog).where(filtro);

    return {
      items: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        autor: f.autor,
        autorEmail: f.autorEmail,
        modulo: MODULO_DE_TABLA.get(f.tabla) ?? null,
        tabla: f.tabla,
        accion: f.accion,
        registroId: f.registroId,
        detalle: f.detalle,
      })),
      total: fila?.total ?? 0,
    };
  });
}
