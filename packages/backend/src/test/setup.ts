// Los tests de integración corren contra Postgres real con el rol de la app
// (RLS activo). El default es el docker-compose local; el CI exporta su propia
// DATABASE_URL apuntando al service container, y por eso esto es `??=`.
//
// No hace falta Testcontainers: el aislamiento entre tests no lo da la base
// sino RLS, porque cada test crea su propia organización (ver test/tenant.ts).
process.env.DATABASE_URL ??= "postgresql://erp_app:erp_app@localhost:5432/erp";
