-- Deja que el rol de la aplicación LEA la tabla de control de migraciones.
--
-- El backend chequea al arrancar que la base esté al día y se niega a levantar
-- si le faltan migraciones (src/db/migraciones.ts). Sin esto no puede: la
-- migración 0001 le revoca a erp_app todos los permisos sobre el schema
-- `drizzle`, y encima nunca tuvo USAGE sobre el schema en sí.
--
-- Es solo SELECT sobre metadatos: qué migraciones se aplicaron y cuándo. No
-- afloja nada del aislamiento entre tenants, que vive en las tablas de negocio
-- con RLS. El resto del revoke de 0001 sigue en pie: erp_app no puede escribir
-- ahí, así que no puede simular estar al día.
GRANT USAGE ON SCHEMA drizzle TO erp_app;
--> statement-breakpoint
GRANT SELECT ON drizzle."__drizzle_migrations" TO erp_app;
