-- Etapa 6 del análisis: el stock se mueve con movimientos y las compras
-- tienen ítems. Reemplaza las decisiones de modelado 3 y 4 de CLAUDE.md.
-- Escrita a mano e idempotente (ver docs/handoff/tareas.md, "Migraciones").

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'tipo_movimiento_stock') THEN
    CREATE TYPE "public"."tipo_movimiento_stock" AS ENUM ('inicial', 'venta', 'devolucion', 'compra', 'ajuste');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movimientos_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"producto_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" "tipo_movimiento_stock" NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"costo_unitario" numeric(14, 2),
	"comprobante_venta_id" uuid,
	"comprobante_compra_id" uuid,
	"motivo" text,
	"usuario_id" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_stock_cantidad_check" CHECK ("cantidad" <> 0),
	CONSTRAINT "movimientos_stock_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE,
	CONSTRAINT "movimientos_stock_producto_fk"
		FOREIGN KEY ("producto_id") REFERENCES "productos"("id"),
	CONSTRAINT "movimientos_stock_venta_fk"
		FOREIGN KEY ("comprobante_venta_id") REFERENCES "comprobantes_venta"("id"),
	CONSTRAINT "movimientos_stock_compra_fk"
		FOREIGN KEY ("comprobante_compra_id") REFERENCES "comprobantes_compra"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movimientos_stock_tenant_producto_idx" ON "movimientos_stock" USING btree ("tenant_id","producto_id","fecha");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items_comprobante_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"costo_unitario" numeric(14, 2) NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "items_compra_cantidad_check" CHECK ("cantidad" > 0),
	CONSTRAINT "items_compra_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE,
	CONSTRAINT "items_compra_comprobante_fk"
		FOREIGN KEY ("comprobante_id") REFERENCES "comprobantes_compra"("id") ON DELETE CASCADE,
	CONSTRAINT "items_compra_producto_fk"
		FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_compra_tenant_comprobante_idx" ON "items_comprobante_compra" USING btree ("tenant_id","comprobante_id");
--> statement-breakpoint

-- Los movimientos de stock no se editan ni se borran: una corrección es un
-- ajuste. Los ítems de una compra tampoco: movieron stock y costo.
GRANT SELECT, INSERT ON "movimientos_stock" TO erp_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "movimientos_stock" FROM erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "items_comprobante_compra" TO erp_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "items_comprobante_compra" FROM erp_app;
--> statement-breakpoint
ALTER TABLE "movimientos_stock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "movimientos_stock" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "items_comprobante_compra" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "items_comprobante_compra" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'movimientos_stock' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "movimientos_stock"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'items_comprobante_compra' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "items_comprobante_compra"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END
$$;
--> statement-breakpoint

-- El stock que había antes de los movimientos queda como un movimiento
-- inicial, para que la historia de cada producto cierre con su stock actual.
-- Empresa por empresa, declarando el tenant (ver 0014: FORCE RLS).
DO $$
DECLARE
  v_tenant text;
BEGIN
  FOR v_tenant IN SELECT id FROM organization LOOP
    PERFORM set_config('app.tenant_id', v_tenant, true);
    INSERT INTO "movimientos_stock" (tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, motivo)
    SELECT p.tenant_id, p.id, current_date, 'inicial', p.stock_actual, p.costo_unitario,
           'Stock que había al empezar a registrar movimientos'
    FROM productos p
    WHERE p.stock_actual <> 0
      AND NOT EXISTS (SELECT 1 FROM movimientos_stock m WHERE m.producto_id = p.id);
  END LOOP;
END
$$;
