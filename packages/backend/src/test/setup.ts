// Los tests de integración corren contra el Postgres local de docker-compose,
// con el rol de la app (RLS activo). TODO: migrar a Testcontainers en CI.
process.env.DATABASE_URL ??= "postgresql://erp_app:erp_app@localhost:5432/erp";
