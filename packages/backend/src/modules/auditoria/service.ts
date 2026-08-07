import { and, count, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { user } from "../../db/schema/auth.js";
import { withTenant } from "../../db/tenant-db.js";
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

/**
 * Los filtros son fechas de calendario argentino, no instantes: quien pone
 * "hasta el 7" espera ver lo del 7 a la tarde. Por eso el corte va contra la
 * medianoche del día siguiente.
 *
 * El offset va fijo porque Argentina no tiene horario de verano; si algún día
 * lo tuviera, esto pasa a `core/dates`.
 */
const OFFSET_ARGENTINA = "-03:00";

function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${OFFSET_ARGENTINA}`);
}

function inicioDelDiaSiguiente(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  // Date.UTC normaliza el desborde de día, mes y año.
  const siguiente = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, (dia ?? 0) + 1));
  return inicioDelDia(siguiente.toISOString().slice(0, 10));
}

export async function listarAuditoria(
  actor: Actor,
  input: AuditoriaListar,
): Promise<{ items: EntradaAuditoria[]; total: number }> {
  return withTenant(actor.tenantId, async (tx) => {
    const condiciones: SQL[] = [];

    if (input.desde) {
      condiciones.push(gte(auditLog.fecha, inicioDelDia(input.desde)));
    }
    if (input.hasta) {
      condiciones.push(lt(auditLog.fecha, inicioDelDiaSiguiente(input.hasta)));
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
