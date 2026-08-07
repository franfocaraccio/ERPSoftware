import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { columnasBase } from "./_comunes.js";

/**
 * Accesos de solo lectura a la empresa, sin cuenta ni contraseña.
 *
 * El token del link es la credencial: cualquiera que lo tenga ve todo lo que ve
 * un miembro de solo lectura. Por eso vence solo, se puede revocar en el
 * momento y queda registrado quién lo generó y cuándo se usó por última vez.
 *
 * A diferencia de un magic link clásico, no se consume en el primer uso: sirve
 * las veces que haga falta hasta que vence. Eso lo hace más cómodo y también
 * más peligroso, y es la razón de que las tres defensas de arriba existan.
 *
 * El link lleva el id de la empresa además del token. No es por seguridad —el
 * id no es secreto, lo que autoriza es el token— sino para poder buscarlo
 * dentro de `withTenant`: la tabla tiene RLS como todas las demás, así que sin
 * saber el tenant de antemano la consulta no devolvería nada.
 */
export const accesosConsolidado = pgTable(
  "accesos_consolidado",
  {
    ...columnasBase,
    /** Random de 32 bytes en hex. Es lo que viaja en el link. */
    token: text("token").notNull(),
    /** Para qué es este acceso: "Contador", "Banco", "Inversor". */
    descripcion: text("descripcion").notNull(),
    /** Usuario que lo generó. Queda aunque después lo saquen del equipo. */
    creadoPor: text("creado_por"),
    expira: timestamp("expira", { withTimezone: true }).notNull(),
    revocadoEn: timestamp("revocado_en", { withTimezone: true }),
    ultimoUso: timestamp("ultimo_uso", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("accesos_consolidado_token_unq").on(t.token),
    index("accesos_consolidado_tenant_idx").on(t.tenantId, t.expira),
  ],
);
