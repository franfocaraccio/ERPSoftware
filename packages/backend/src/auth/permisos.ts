import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Control de acceso del plugin organization. Cubre la gestión de la
 * organización en sí (miembros, invitaciones), NO los datos de negocio:
 * eso se resuelve en los middlewares de tRPC (ver trpc/trpc.ts).
 */
export const ac = createAccessControl(defaultStatements);

/** Todo, incluida la gestión de usuarios y la delegación de ARCA. */
export const dueno = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

/** Opera comprobantes, tesorería e impuestos, pero no gestiona la organización. */
export const administrativo = ac.newRole({});

/** Solo lectura y descarga de comprobantes e impuestos. */
export const contador = ac.newRole({});

/** Vista Consolidada únicamente. */
export const soloLectura = ac.newRole({});

export const rolesOrganizacion = {
  dueno,
  administrativo,
  contador,
  solo_lectura: soloLectura,
};
