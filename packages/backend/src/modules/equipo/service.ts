import { and, eq, gt } from "drizzle-orm";
import { esRolOrganizacion, type RolOrganizacion } from "../../auth/roles.js";
import { db } from "../../db/client.js";
import { auditLog } from "../../db/schema/auditoria.js";
import { invitation, member, user } from "../../db/schema/auth.js";
import { permisosPanel } from "../../db/schema/permisos.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";

interface Actor {
  tenantId: string;
  usuarioId: string;
}

export interface MiembroEquipo {
  usuarioId: string;
  nombre: string;
  email: string;
  rol: RolOrganizacion;
  verPanel: boolean;
  desde: Date;
  esUnoMismo: boolean;
}

export interface InvitacionPendiente {
  id: string;
  email: string;
  rol: RolOrganizacion;
  verPanel: boolean;
  expira: Date;
}

/**
 * Sin fila en `permisos_panel` el acceso se considera otorgado. Así los
 * miembros anteriores a esta función no pierden el panel de un día para el
 * otro, y el checkbox arranca tildado.
 */
const VER_PANEL_POR_DEFECTO = true;

/** Permiso de panel de todos los sujetos del tenant, indexado para cruzar. */
async function permisosDelTenant(tx: TenantTx) {
  const filas = await tx
    .select({
      userId: permisosPanel.userId,
      invitacionId: permisosPanel.invitacionId,
      verPanel: permisosPanel.verPanel,
    })
    .from(permisosPanel);

  const porMiembro = new Map<string, boolean>();
  const porInvitacion = new Map<string, boolean>();
  for (const fila of filas) {
    if (fila.userId) {
      porMiembro.set(fila.userId, fila.verPanel);
    } else if (fila.invitacionId) {
      porInvitacion.set(fila.invitacionId, fila.verPanel);
    }
  }
  return { porMiembro, porInvitacion };
}

/** Lee el permiso de una persona concreta. Lo usa el guard del panel. */
export async function puedeVerPanel(tenantId: string, usuarioId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ verPanel: permisosPanel.verPanel })
      .from(permisosPanel)
      .where(eq(permisosPanel.userId, usuarioId))
      .limit(1);
    return fila?.verPanel ?? VER_PANEL_POR_DEFECTO;
  });
}

export async function listarEquipo(
  actor: Actor,
): Promise<{ miembros: MiembroEquipo[]; invitaciones: InvitacionPendiente[] }> {
  // Las tablas de auth son globales (no llevan RLS): se filtran por la
  // organización activa, que sale de la sesión y nunca de un input.
  const filasMiembros = await db
    .select({
      usuarioId: member.userId,
      rol: member.role,
      desde: member.createdAt,
      nombre: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, actor.tenantId));

  const filasInvitaciones = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      rol: invitation.role,
      expira: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, actor.tenantId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    );

  const { porMiembro, porInvitacion } = await withTenant(actor.tenantId, permisosDelTenant);

  const miembros = filasMiembros
    .filter((f) => esRolOrganizacion(f.rol))
    .map((f) => ({
      usuarioId: f.usuarioId,
      nombre: f.nombre,
      email: f.email,
      rol: f.rol as RolOrganizacion,
      verPanel: porMiembro.get(f.usuarioId) ?? VER_PANEL_POR_DEFECTO,
      desde: f.desde,
      esUnoMismo: f.usuarioId === actor.usuarioId,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const invitaciones = filasInvitaciones
    .filter((f) => f.rol !== null && esRolOrganizacion(f.rol))
    .map((f) => ({
      id: f.id,
      email: f.email,
      rol: f.rol as RolOrganizacion,
      verPanel: porInvitacion.get(f.id) ?? VER_PANEL_POR_DEFECTO,
      expira: f.expira,
    }));

  return { miembros, invitaciones };
}

/**
 * Guarda el permiso elegido para una invitación recién creada. Se aplica al
 * miembro cuando la acepta (ver `traspasarPermisoDeInvitacion`).
 */
export async function registrarPermisoInvitacion(
  actor: Actor,
  invitacionId: string,
  verPanel: boolean,
): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    await tx.insert(permisosPanel).values({
      tenantId: actor.tenantId,
      invitacionId,
      verPanel,
    });
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "permisos_panel",
      accion: "alta",
      detalle: { invitacionId, verPanel },
    });
  });
}

/**
 * Al aceptarse la invitación, el permiso pasa de la invitación al miembro.
 * Se llama desde el alta por invitación, que conoce el tenant aunque sea un
 * endpoint público.
 */
export async function traspasarPermisoDeInvitacion(
  tenantId: string,
  invitacionId: string,
  usuarioId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [pendiente] = await tx
      .select({ id: permisosPanel.id, verPanel: permisosPanel.verPanel })
      .from(permisosPanel)
      .where(eq(permisosPanel.invitacionId, invitacionId))
      .limit(1);

    if (!pendiente) {
      return;
    }

    // Si la persona ya era miembro de esta organización, su permiso vigente
    // manda: la invitación no debería pisarlo por accidente.
    const [existente] = await tx
      .select({ id: permisosPanel.id })
      .from(permisosPanel)
      .where(eq(permisosPanel.userId, usuarioId))
      .limit(1);

    if (existente) {
      await tx.delete(permisosPanel).where(eq(permisosPanel.id, pendiente.id));
      return;
    }

    await tx
      .update(permisosPanel)
      .set({ userId: usuarioId, invitacionId: null })
      .where(eq(permisosPanel.id, pendiente.id));
  });
}

export async function cambiarAccesoPanel(
  actor: Actor,
  usuarioId: string,
  verPanel: boolean,
): Promise<void> {
  await withTenant(actor.tenantId, async (tx) => {
    const [existente] = await tx
      .select({ id: permisosPanel.id })
      .from(permisosPanel)
      .where(eq(permisosPanel.userId, usuarioId))
      .limit(1);

    if (existente) {
      await tx.update(permisosPanel).set({ verPanel }).where(eq(permisosPanel.id, existente.id));
    } else {
      await tx
        .insert(permisosPanel)
        .values({ tenantId: actor.tenantId, userId: usuarioId, verPanel });
    }

    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "permisos_panel",
      accion: "modificacion",
      detalle: { usuarioId, verPanel },
    });
  });
}

/** Limpia el permiso reservado para una invitación que se cancela. */
export async function borrarPermisoInvitacion(
  tenantId: string,
  invitacionId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.delete(permisosPanel).where(eq(permisosPanel.invitacionId, invitacionId));
  });
}

/** True si el usuario es miembro de la organización. Evita tocar otros tenants. */
export async function esMiembro(tenantId: string, usuarioId: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, tenantId), eq(member.userId, usuarioId)))
    .limit(1);
  return Boolean(fila);
}

/** Invitación pendiente de esta organización, para no cancelar la de otra. */
export async function invitacionDelTenant(
  tenantId: string,
  invitacionId: string,
): Promise<boolean> {
  const [fila] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.id, invitacionId), eq(invitation.organizationId, tenantId)))
    .limit(1);
  return Boolean(fila);
}
