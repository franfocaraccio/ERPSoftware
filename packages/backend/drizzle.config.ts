import { defineConfig } from "drizzle-kit";

// Las migraciones corren con el rol OWNER (erp), no con el rol de la app.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATIONS ?? "postgresql://erp:erp@localhost:5432/erp",
  },
});
