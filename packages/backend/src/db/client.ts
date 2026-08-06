import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

// La app se conecta con un rol SIN BYPASSRLS (erp_app en desarrollo).
// Requiere session mode (no transaction pooling): SET LOCAL y pg_advisory_xact_lock
// dependen de que la transacción viva en una única conexión.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta la variable de entorno DATABASE_URL");
}

export const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema, casing: "snake_case" });
