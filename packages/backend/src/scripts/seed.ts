import "../env.js";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { auth } from "../auth/auth.js";
import { ROL_PLATAFORMA_ADMIN } from "../auth/roles.js";
import { account, member, organization, user } from "../db/schema/auth.js";
import * as schema from "../db/schema/index.js";

/**
 * El seed corre con el rol OWNER, no con el de la aplicación: tiene que
 * escribir en el audit log (insert-only para la app) y reapuntar filas de
 * todos los tenants, cosa que RLS le impediría a erp_app.
 */
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL_MIGRATIONS ?? "postgresql://erp:erp@localhost:5432/erp",
});
const db = drizzle(pool, { schema, casing: "snake_case" });

/**
 * Seed de desarrollo. Idempotente: se puede correr varias veces.
 *
 * 1. Crea el primer admin de plataforma (el arranque en frío: con el registro
 *    público desactivado, alguien tiene que existir antes que nadie).
 * 2. Crea una organización de desarrollo con su dueño de prueba.
 * 3. Reapunta los datos que quedaron con tenant_id = 'tenant-dev' a esa
 *    organización, para no perder lo cargado desde la UI.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@erppyme.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin-plataforma-2026";
const ADMIN_NOMBRE = "Administrador de plataforma";

const DUENO_EMAIL = process.env.SEED_DUENO_EMAIL ?? "dueno@demo.dev";
const DUENO_PASSWORD = process.env.SEED_DUENO_PASSWORD ?? "dueno-demo-2026";
const DUENO_NOMBRE = "Dueño de prueba";

const ORG_NOMBRE = "PyME Demo";
const ORG_SLUG = "pyme-demo";

/** Tablas de negocio cuyo tenant_id hay que reapuntar. */
const TABLAS_NEGOCIO = [
  "clientes",
  "proveedores",
  "productos",
  "cuentas",
  "movimientos",
  "cheques",
  "impuestos",
  "comprobantes_venta",
  "items_comprobante_venta",
  "comprobantes_compra",
  "parametros",
  "audit_log",
] as const;

/**
 * Crea un usuario con la contraseña hasheada por better-auth. No se puede usar
 * signUpEmail porque el registro público está desactivado a propósito.
 */
async function crearUsuario(datos: {
  email: string;
  password: string;
  nombre: string;
  rolPlataforma: string;
}): Promise<string> {
  const [existente] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, datos.email))
    .limit(1);
  if (existente) {
    console.log(`  ya existía: ${datos.email}`);
    return existente.id;
  }

  const ctx = await auth.$context;
  const id = randomUUID();
  const ahora = new Date();

  await db.insert(user).values({
    id,
    name: datos.nombre,
    email: datos.email,
    emailVerified: true,
    role: datos.rolPlataforma,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await ctx.password.hash(datos.password),
    createdAt: ahora,
    updatedAt: ahora,
  });

  console.log(`  creado: ${datos.email}`);
  return id;
}

async function main(): Promise<void> {
  console.log("Admin de plataforma:");
  await crearUsuario({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    nombre: ADMIN_NOMBRE,
    rolPlataforma: ROL_PLATAFORMA_ADMIN,
  });

  console.log("Dueño de la organización de prueba:");
  const duenoId = await crearUsuario({
    email: DUENO_EMAIL,
    password: DUENO_PASSWORD,
    nombre: DUENO_NOMBRE,
    rolPlataforma: "user",
  });

  console.log("Organización de desarrollo:");
  let [org] = await db.select().from(organization).where(eq(organization.slug, ORG_SLUG)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organization)
      .values({
        id: randomUUID(),
        name: ORG_NOMBRE,
        slug: ORG_SLUG,
        createdAt: new Date(),
      })
      .returning();
    console.log(`  creada: ${ORG_NOMBRE}`);
  } else {
    console.log(`  ya existía: ${ORG_NOMBRE}`);
  }
  if (!org) {
    throw new Error("No se pudo crear la organización");
  }

  const [membresia] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, duenoId))
    .limit(1);
  if (!membresia) {
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId: duenoId,
      role: "dueno",
      createdAt: new Date(),
    });
    console.log("  dueño agregado como miembro");
  }

  console.log("Migrando datos de 'tenant-dev':");
  let total = 0;
  for (const tabla of TABLAS_NEGOCIO) {
    const resultado = await db.execute(
      sql`update ${sql.identifier(tabla)} set tenant_id = ${org.id} where tenant_id = 'tenant-dev'`,
    );
    const filas = resultado.rowCount ?? 0;
    total += filas;
    if (filas > 0) {
      console.log(`  ${tabla}: ${filas}`);
    }
  }
  console.log(total === 0 ? "  no había datos para migrar" : `  total: ${total} filas`);

  console.log("\nListo. Credenciales de desarrollo:");
  console.log(`  admin de plataforma → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  dueño de PyME Demo → ${DUENO_EMAIL} / ${DUENO_PASSWORD}`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
