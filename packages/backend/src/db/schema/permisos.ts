import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase } from "./_comunes.js";

/**
 * Acceso al panel de indicadores, por persona.
 *
 * No es un rol: dos personas con el mismo puesto pueden diferir en si les
 * corresponde ver márgenes, liquidez y proyección de caja. Modelarlo como rol
 * obligaría a duplicar cada rol existente.
 *
 * Una fila apunta a un miembro (`userId`) o a una invitación todavía sin
 * aceptar (`invitacionId`), nunca a los dos: es el mismo permiso en dos etapas
 * de su vida. Al aceptarse la invitación, la fila se reemplaza por la del
 * miembro.
 *
 * Sin fila, el permiso se considera otorgado: los miembros que ya existían
 * cuando esto se agregó siguen viendo el panel, y quien invita tiene que
 * destildar explícitamente para quitarlo.
 */
export const permisosPanel = pgTable(
  "permisos_panel",
  {
    ...columnasBase,
    userId: text("user_id"),
    invitacionId: text("invitacion_id"),
    verPanel: boolean("ver_panel").default(true).notNull(),
  },
  (t) => [
    uniqueIndex("permisos_panel_miembro_unq")
      .on(t.tenantId, t.userId)
      .where(sql`user_id is not null`),
    uniqueIndex("permisos_panel_invitacion_unq")
      .on(t.invitacionId)
      .where(sql`invitacion_id is not null`),
    check("permisos_panel_sujeto_unico", sql`(user_id is not null) <> (invitacion_id is not null)`),
  ],
);
