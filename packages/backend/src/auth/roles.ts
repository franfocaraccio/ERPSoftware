/**
 * Roles del dominio, dentro de una organización.
 * Son distintos del rol de plataforma: ver ROL_PLATAFORMA_ADMIN.
 */
export const ROLES_ORGANIZACION = ["administrador", "escritura_lectura", "solo_lectura"] as const;

export type RolOrganizacion = (typeof ROLES_ORGANIZACION)[number];

export const ETIQUETA_ROL: Record<RolOrganizacion, string> = {
  administrador: "Administrador",
  escritura_lectura: "Escritura/Lectura",
  solo_lectura: "Solo lectura",
};

/**
 * Rol de plataforma: nosotros, los operadores del SaaS. Vive en el campo
 * `role` del usuario (plugin admin), NO en la membresía de una organización.
 * Un admin de plataforma crea organizaciones e invita al primer administrador
 * de cada una, pero por decisión de producto NO puede ver los datos de las
 * PyMEs.
 */
export const ROL_PLATAFORMA_ADMIN = "admin";
export const ROL_PLATAFORMA_USUARIO = "user";

/**
 * Roles que van a exigir segundo factor verificado cuando exista la emisión
 * real contra ARCA (Fase 3). Hoy no se aplica: en Fase 1 cambiar el estado de
 * un comprobante no tiene efecto fiscal, y exigir MFA bloquearía la operación
 * sin ganar seguridad. El guard se agrega junto con la emisión.
 */
export const ROLES_CON_MFA_OBLIGATORIO: readonly RolOrganizacion[] = [
  "administrador",
  "escritura_lectura",
];

/** Roles que pueden escribir datos de negocio. */
export const ROLES_ESCRITURA: readonly RolOrganizacion[] = ["administrador", "escritura_lectura"];

/** Roles que pueden gestionar usuarios de la organización. */
export const ROLES_GESTION_USUARIOS: readonly RolOrganizacion[] = ["administrador"];

export function esRolOrganizacion(valor: string): valor is RolOrganizacion {
  return (ROLES_ORGANIZACION as readonly string[]).includes(valor);
}
