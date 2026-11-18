import "../env.js";
import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * Deja la organización de la demo como recién cargada.
 *
 * Borra todo lo que esa empresa tenga y vuelve a correr `datos-demo.sql`. Está
 * pensado para un cron: la demo es pública, cualquiera puede cargar, borrar o
 * ensuciar lo que quiera, y a las pocas horas deja de mostrar lo que tiene que
 * mostrar.
 *
 * **Borra datos y no se puede deshacer.** Por eso pide dos cosas que nadie
 * tiene por accidente: el id de la organización a resetear, y una variable
 * que diga explícitamente que este entorno acepta que lo reseteen. Sin las
 * dos, no hace nada. La idea es que, si alguna vez alguien corre esto con el
 * `DATABASE_URL` de producción pegado en la terminal, no pase nada.
 *
 * Uso:
 *   DEMO_RESET_HABILITADO=si DEMO_TENANT_ID=<org> \
 *     pnpm --filter @erp/backend demo:reset
 */

const HABILITADO = process.env.DEMO_RESET_HABILITADO === "si";
const TENANT = process.env.DEMO_TENANT_ID;

/** Máximo de pasadas de borrado. Ver `borrarTodoDe`. */
const PASADAS = 12;

/**
 * El audit log no se toca: la aplicación tiene revocado el DELETE sobre esa
 * tabla a propósito (un log que la app puede borrar no es un log). En la demo
 * eso significa que el historial se acumula entre resets, y está bien: son
 * todos movimientos inventados, y muestra la función andando.
 */
const NO_SE_BORRAN = new Set(["audit_log"]);

function abortar(motivo: string): never {
  console.error(`No se hizo nada: ${motivo}`);
  process.exit(1);
}

if (!HABILITADO) {
  abortar(
    "este entorno no está marcado como reseteable. " +
      "Si de verdad querés vaciar esta base, poné DEMO_RESET_HABILITADO=si.",
  );
}
if (!TENANT) {
  abortar("falta DEMO_TENANT_ID, el id de la organización de la demo.");
}

// Con el rol dueño: hay que poder borrar de todas las tablas, y RLS se aplica
// igual porque las tablas de negocio usan FORCE ROW LEVEL SECURITY.
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL_MIGRATIONS ?? "postgresql://erp:erp@localhost:5432/erp",
});

/** Las tablas que llevan `tenant_id`, preguntándoselo a la base. */
async function tablasConTenant(cliente: pg.PoolClient): Promise<string[]> {
  const { rows } = await cliente.query<{ table_name: string }>(
    `select table_name
       from information_schema.columns
      where table_schema = 'public' and column_name = 'tenant_id'
      order by table_name`,
  );
  return rows.map((r) => r.table_name).filter((t) => !NO_SE_BORRAN.has(t));
}

/**
 * Borra las filas de una empresa de todas sus tablas.
 *
 * El orden importa por las claves foráneas —no se puede borrar un comprobante
 * antes que sus ítems— y calcularlo a partir del grafo de constraints sería
 * exacto y frágil: cambia con cada migración. En vez de eso se intenta cada
 * tabla y la que falle por una referencia queda para la pasada siguiente,
 * cuando sus hijas ya no estén. Cada intento va en su savepoint, porque en
 * Postgres un error aborta la transacción entera.
 *
 * Converge en dos o tres pasadas. Si después de `PASADAS` queda algo, es que
 * hay un ciclo de referencias y conviene enterarse con un error.
 */
async function borrarTodoDe(cliente: pg.PoolClient, tenant: string): Promise<number> {
  let pendientes = await tablasConTenant(cliente);
  let borradas = 0;

  for (let pasada = 0; pasada < PASADAS && pendientes.length > 0; pasada++) {
    const fallaron: string[] = [];
    for (const tabla of pendientes) {
      await cliente.query("savepoint intento");
      try {
        const r = await cliente.query(`delete from "${tabla}" where tenant_id = $1`, [tenant]);
        await cliente.query("release savepoint intento");
        borradas += r.rowCount ?? 0;
      } catch {
        await cliente.query("rollback to savepoint intento");
        fallaron.push(tabla);
      }
    }
    if (fallaron.length === pendientes.length) {
      throw new Error(
        `No se pudo vaciar: ${fallaron.join(", ")}. ¿Hay un ciclo de claves foráneas?`,
      );
    }
    pendientes = fallaron;
  }

  if (pendientes.length > 0) {
    throw new Error(`Quedaron tablas sin vaciar después de ${PASADAS} pasadas: ${pendientes}`);
  }
  return borradas;
}

/**
 * El SQL de demostración, tal cual está en el repo.
 *
 * No se le toca nada: el archivo toma la organización de `app.tenant_id` si
 * está declarada, y acá se declara antes de ejecutarlo. Así el reset carga
 * exactamente en la empresa que acaba de vaciar, sin depender de a cuántas
 * organizaciones pertenezca la cuenta de la demo.
 */
function sqlDeDemo(): string {
  const ruta = new URL("../../scripts/datos-demo.sql", import.meta.url);
  return readFileSync(ruta, "utf8");
}

async function main(): Promise<void> {
  const cliente = await pool.connect();
  console.log(`Reseteando la organización ${TENANT}.`);

  try {
    await cliente.query("begin");
    await cliente.query("select set_config('app.tenant_id', $1, true)", [TENANT]);

    const borradas = await borrarTodoDe(cliente, TENANT as string);
    console.log(`  borradas: ${borradas} filas`);

    await cliente.query(sqlDeDemo());
    await cliente.query("commit");

    const { rows } = await cliente.query<{ n: string }>(
      "select count(*)::text as n from comprobantes_venta where tenant_id = $1",
      [TENANT],
    );
    console.log(`  cargadas: ${rows[0]?.n ?? "0"} ventas de demostración`);
    console.log("Listo.");
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("El reset falló y no cambió nada:", error);
  process.exit(1);
});
