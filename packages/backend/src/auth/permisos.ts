import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Control de acceso del plugin organization. Cubre la gestión de la
 * organización en sí (miembros, invitaciones), NO los datos de negocio:
 * eso se resuelve en los middlewares de tRPC (ver trpc/trpc.ts).
 */
export const ac = createAccessControl(defaultStatements);

/** Todo, incluida la gestión de usuarios y la delegación de ARCA. */
export const administrador = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

/** Carga y edita datos de negocio, pero no gestiona la organización. */
export const escrituraLectura = ac.newRole({});

/**
 * Lectura sin escritura. Es el rol del contador externo y de cualquiera que
 * tenga que mirar sin tocar. Antes existía un rol `contador` aparte, pero sus
 * permisos eran idénticos a este: dos nombres para lo mismo confunden a quien
 * invita.
 */
export const soloLectura = ac.newRole({});

export const rolesOrganizacion = {
  administrador,
  escritura_lectura: escrituraLectura,
  solo_lectura: soloLectura,
};
