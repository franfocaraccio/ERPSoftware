-- Hasta ahora `tenant_id` era un text suelto: la tabla de organizaciones no
-- existía todavía. Con BetterAuth ya creada, se cierra la referencia.
--
-- Primero se descartan las filas de tenants que nunca fueron organizaciones
-- (corridas viejas de los tests de integración, que usaban ids inventados).
-- Los tests ahora crean organizaciones reales.
DELETE FROM audit_log WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM items_comprobante_venta WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM movimientos WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM comprobantes_venta WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM comprobantes_compra WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM cheques WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM cuentas WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM productos WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM impuestos WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM proveedores WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM clientes WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint
DELETE FROM parametros WHERE tenant_id NOT IN (SELECT id FROM organization);
--> statement-breakpoint

-- Borrar una organización arrastra todos sus datos: es lo correcto para dar de
-- baja a un cliente, y evita filas huérfanas invisibles bajo RLS.
ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE proveedores ADD CONSTRAINT proveedores_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE productos ADD CONSTRAINT productos_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE cuentas ADD CONSTRAINT cuentas_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE cheques ADD CONSTRAINT cheques_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE impuestos ADD CONSTRAINT impuestos_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE comprobantes_venta ADD CONSTRAINT comprobantes_venta_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE items_comprobante_venta ADD CONSTRAINT items_comprobante_venta_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE comprobantes_compra ADD CONSTRAINT comprobantes_compra_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE parametros ADD CONSTRAINT parametros_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE audit_log ADD CONSTRAINT audit_log_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES organization(id) ON DELETE CASCADE;
