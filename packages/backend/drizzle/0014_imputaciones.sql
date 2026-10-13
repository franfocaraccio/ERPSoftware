-- Imputaciones: qué parte de un cobro o un pago cancela cada comprobante.
-- Escrita a mano, como todas desde la 0013 (ver docs/handoff/tareas.md,
-- "Migraciones"). Idempotente: puede correr sobre una base que ya la tiene.

CREATE TABLE IF NOT EXISTS "imputaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"comprobante_venta_id" uuid,
	"comprobante_compra_id" uuid,
	"importe" numeric(14, 2) NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imputaciones_importe_check" CHECK ("importe" > 0),
	CONSTRAINT "imputaciones_un_comprobante"
		CHECK (("comprobante_venta_id" IS NULL) <> ("comprobante_compra_id" IS NULL)),
	CONSTRAINT "imputaciones_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE,
	-- Borrar el movimiento se lleva sus imputaciones: sin él no significan nada.
	CONSTRAINT "imputaciones_movimiento_fk"
		FOREIGN KEY ("movimiento_id") REFERENCES "movimientos"("id") ON DELETE CASCADE,
	CONSTRAINT "imputaciones_venta_fk"
		FOREIGN KEY ("comprobante_venta_id") REFERENCES "comprobantes_venta"("id"),
	CONSTRAINT "imputaciones_compra_fk"
		FOREIGN KEY ("comprobante_compra_id") REFERENCES "comprobantes_compra"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imputaciones_tenant_movimiento_idx" ON "imputaciones" USING btree ("tenant_id","movimiento_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imputaciones_tenant_venta_idx" ON "imputaciones" USING btree ("tenant_id","comprobante_venta_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imputaciones_tenant_compra_idx" ON "imputaciones" USING btree ("tenant_id","comprobante_compra_id");
--> statement-breakpoint

-- Una imputación no se edita: al cambiar un movimiento se borran y se vuelven
-- a escribir. El REVOKE es imprescindible: 0001 dejó un ALTER DEFAULT
-- PRIVILEGES que da UPDATE a erp_app sobre toda tabla nueva (ver 0011).
GRANT SELECT, INSERT, DELETE ON "imputaciones" TO erp_app;
--> statement-breakpoint
REVOKE UPDATE ON "imputaciones" FROM erp_app;
--> statement-breakpoint

ALTER TABLE "imputaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "imputaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE tablename = 'imputaciones' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "imputaciones"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END
$$;
--> statement-breakpoint

-- La mora deja de marcarse a mano: se calcula con el umbral de Parámetros. El
-- valor 'en_mora' queda en el enum para no tocar el tipo, pero nada lo escribe.
UPDATE "clientes" SET "estado" = 'activo' WHERE "estado" = 'en_mora';
