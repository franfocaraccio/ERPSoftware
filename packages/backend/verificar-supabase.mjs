// Verificación de la conexión de la aplicación contra Supabase.
// Temporal: se corre a mano con DATABASE_URL seteada al rol erp_app.
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const [{ usuario, superusuario }] = (
  await pool.query(
    "select current_user as usuario, current_setting('is_superuser') as superusuario",
  )
).rows;

const [{ rolbypassrls }] = (
  await pool.query("select rolbypassrls from pg_roles where rolname = current_user")
).rows;

// Sin app.tenant_id, la política tenant_isolation tiene que dejar la tabla
// en cero filas. Si devolviera datos, RLS no estaría protegiendo nada.
const [{ visibles }] = (await pool.query("select count(*)::int as visibles from clientes")).rows;

console.log(`Usuario conectado ..... ${usuario}`);
console.log(`Es superusuario ....... ${superusuario}`);
console.log(`Puede saltear RLS ..... ${rolbypassrls}`);
console.log(`Clientes sin tenant ... ${visibles}`);

const bien = usuario === "erp_app" && superusuario === "off" && !rolbypassrls && visibles === 0;
console.log(
  bien ? "\nOK: la conexión de la app está bien aislada." : "\nATENCIÓN: revisar arriba.",
);

await pool.end();
process.exit(bien ? 0 : 1);
