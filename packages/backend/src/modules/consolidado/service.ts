import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { accesosConsolidado } from "../../db/schema/accesos.js";
import { auditLog } from "../../db/schema/auditoria.js";
import { withTenant } from "../../db/tenant-db.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

/** Lo que dura un acceso desde que se genera. */
export const HORAS_DE_VIDA = 48;

export interface AccesoConsolidado {
  id: string;
  descripcion: string;
  creado: Date;
  expira: Date;
  ultimoUso: Date | null;
  vencido: boolean;
  /** Solo se devuelve al crearlo y al listarlo para quien administra. */
  link: string;
}

function urlFrontend(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:5173";
}

/**
 * El link lleva la empresa y el token. La empresa no es secreta: sirve para
 * poder buscar el token dentro de `withTenant`, porque la tabla tiene RLS.
 */
export function linkConsolidado(tenantId: string, token: string): string {
  return `${urlFrontend()}/consolidado/${tenantId}/${token}`;
}

export async function crearAcceso(actor: Actor, descripcion: string): Promise<AccesoConsolidado> {
  // 32 bytes de aleatoriedad criptográfica: el token es lo único que separa a
  // un desconocido de todos los datos de la empresa.
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + HORAS_DE_VIDA * 60 * 60 * 1000);

  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(accesosConsolidado)
      .values({
        tenantId: actor.tenantId,
        token,
        descripcion,
        creadoPor: actor.usuarioId,
        expira,
      })
      .returning();

    if (!creado) {
      throw new Error("No se pudo generar el acceso");
    }

    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "accesos_consolidado",
      registroId: creado.id,
      accion: "alta",
      // El token no va al audit log: es una credencial viva.
      detalle: { descripcion, expira: expira.toISOString() },
    });

    return {
      id: creado.id,
      descripcion: creado.descripcion,
      creado: creado.createdAt,
      expira: creado.expira,
      ultimoUso: null,
      vencido: false,
      link: linkConsolidado(actor.tenantId, token),
    };
  });
}

/** Accesos vigentes o vencidos, sin los revocados: esos ya no existen. */
export async function listarAccesos(actor: Actor): Promise<AccesoConsolidado[]> {
  return withTenant(actor.tenantId, async (tx) => {
    const filas = await tx
      .select()
      .from(accesosConsolidado)
      .where(isNull(accesosConsolidado.revocadoEn))
      .orderBy(desc(accesosConsolidado.createdAt));

    const ahora = Date.now();
    return filas.map((f) => ({
      id: f.id,
      descripcion: f.descripcion,
      creado: f.createdAt,
      expira: f.expira,
      ultimoUso: f.ultimoUso,
      vencido: f.expira.getTime() <= ahora,
      link: linkConsolidado(actor.tenantId, f.token),
    }));
  });
}

export async function revocarAcceso(actor: Actor, id: string): Promise<boolean> {
  return withTenant(actor.tenantId, async (tx) => {
    const [revocado] = await tx
      .update(accesosConsolidado)
      .set({ revocadoEn: new Date() })
      .where(and(eq(accesosConsolidado.id, id), isNull(accesosConsolidado.revocadoEn)))
      .returning({ id: accesosConsolidado.id, descripcion: accesosConsolidado.descripcion });

    if (!revocado) {
      return false;
    }

    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "accesos_consolidado",
      registroId: revocado.id,
      accion: "baja",
      detalle: { descripcion: revocado.descripcion },
    });
    return true;
  });
}

export interface AccesoVigente {
  tenantId: string;
  accesoId: string;
  descripcion: string;
  expira: Date;
}

/**
 * Valida el token de un link. Devuelve null si no existe, si fue revocado o si
 * venció: al que está del otro lado no se le dice cuál de las tres, porque no
 * tiene por qué saber si el token existió alguna vez.
 *
 * El último uso se registra acá. Es lo que le permite al Administrador ver si
 * el link que mandó lo están usando.
 */
export async function validarToken(tenantId: string, token: string): Promise<AccesoVigente | null> {
  return withTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select()
      .from(accesosConsolidado)
      .where(eq(accesosConsolidado.token, token))
      .limit(1);

    if (!fila || fila.revocadoEn !== null || fila.expira.getTime() <= Date.now()) {
      return null;
    }

    await tx
      .update(accesosConsolidado)
      .set({ ultimoUso: new Date() })
      .where(eq(accesosConsolidado.id, fila.id));

    return {
      tenantId: fila.tenantId,
      accesoId: fila.id,
      descripcion: fila.descripcion,
      expira: fila.expira,
    };
  });
}
