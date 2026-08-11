import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "./client.js";

interface Journal {
  entries: { idx: number; tag: string }[];
}

/**
 * Las migraciones se aplican desde el CI, no desde el contenedor: el rol dueño
 * puede saltear RLS y no tiene por qué vivir en un proceso expuesto a internet.
 * El costo de esa separación es que el deploy del código y el de la base son
 * dos cosas distintas, y pueden quedar desfasadas.
 *
 * Este chequeo convierte ese desfasaje en un arranque fallido con un mensaje
 * claro, en vez de errores 500 salteados cuando una consulta pide una columna
 * que todavía no existe.
 */
export async function verificarMigraciones(): Promise<void> {
  const journal: Journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  const esperadas = journal.entries.length;

  let aplicadas: number;
  try {
    const resultado = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from drizzle."__drizzle_migrations"`,
    );
    aplicadas = resultado.rows[0]?.n ?? 0;
  } catch (error) {
    // No poder leer la tabla no prueba que falten migraciones: puede ser que
    // falte el GRANT de la 0010. Se avisa fuerte y se sigue, porque negarse a
    // arrancar por un chequeo que no se pudo hacer es peor que no chequear.
    console.warn(
      "[migraciones] No se pudo leer el estado de migraciones, sigo sin verificar.",
      "¿Falta aplicar 0010_permitir_leer_estado_migraciones?",
      error instanceof Error ? error.message : error,
    );
    return;
  }

  if (aplicadas < esperadas) {
    const faltantes = journal.entries.slice(aplicadas).map((e) => e.tag);
    throw new Error(
      `La base está atrasada: faltan ${esperadas - aplicadas} migraciones (${faltantes.join(", ")}). ` +
        "Aplicalas con `pnpm --filter @erp/backend db:migrate` antes de levantar este código.",
    );
  }

  // Más migraciones que entradas en el journal es el caso de un rollback del
  // código: la base quedó adelante. No se bloquea —volver atrás es una
  // maniobra legítima— pero se avisa, porque el código viejo puede no saber
  // nada de lo que la base ya tiene.
  if (aplicadas > esperadas) {
    console.warn(
      `[migraciones] La base tiene ${aplicadas} migraciones y este código conoce ${esperadas}.`,
      "¿Se deployó una versión anterior?",
    );
  }
}
