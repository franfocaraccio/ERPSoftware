-- Rol de la aplicación: sin BYPASSRLS, sin ownership de tablas.
-- En desarrollo local la password es fija; en producción el rol se crea aparte
-- con credenciales del entorno.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app LOGIN PASSWORD 'erp_app';
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
--> statement-breakpoint
-- El audit log es insert-only para la aplicación.
REVOKE UPDATE, DELETE ON audit_log FROM erp_app;
--> statement-breakpoint
-- La tabla de control de migraciones no es de la app.
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM erp_app;
--> statement-breakpoint

-- Aislamiento multi-tenant: toda tabla de negocio habilita RLS (con FORCE, para que
-- aplique incluso al owner en desarrollo) y una única política que compara tenant_id
-- con current_setting('app.tenant_id', true). El segundo argumento (missing_ok) hace
-- que sin SET LOCAL previo la comparación sea contra NULL y no devuelva ninguna fila.
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON clientes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE proveedores FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON proveedores
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE productos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON productos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cuentas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cuentas
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE movimientos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON movimientos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cheques FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cheques
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE impuestos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE impuestos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON impuestos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE comprobantes_venta ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE comprobantes_venta FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON comprobantes_venta
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE items_comprobante_venta ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE items_comprobante_venta FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON items_comprobante_venta
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE comprobantes_compra ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE comprobantes_compra FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON comprobantes_compra
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE parametros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE parametros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON parametros
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
