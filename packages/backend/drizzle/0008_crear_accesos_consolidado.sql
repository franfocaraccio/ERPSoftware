CREATE TABLE "accesos_consolidado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"token" text NOT NULL,
	"descripcion" text NOT NULL,
	"creado_por" text,
	"expira" timestamp with time zone NOT NULL,
	"revocado_en" timestamp with time zone,
	"ultimo_uso" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accesos_consolidado_token_unq" ON "accesos_consolidado" USING btree ("token");--> statement-breakpoint
CREATE INDEX "accesos_consolidado_tenant_idx" ON "accesos_consolidado" USING btree ("tenant_id","expira");--> statement-breakpoint

-- A mano: drizzle-kit no genera RLS ni la FK de tenant (ver 0001 y 0003).
ALTER TABLE "accesos_consolidado"
  ADD CONSTRAINT "accesos_consolidado_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "accesos_consolidado" TO erp_app;
--> statement-breakpoint
ALTER TABLE "accesos_consolidado" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accesos_consolidado" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accesos_consolidado"
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
