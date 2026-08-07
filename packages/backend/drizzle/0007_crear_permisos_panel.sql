CREATE TABLE "permisos_panel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"invitacion_id" text,
	"ver_panel" boolean DEFAULT true NOT NULL,
	CONSTRAINT "permisos_panel_sujeto_unico" CHECK ((user_id is not null) <> (invitacion_id is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "permisos_panel_miembro_unq" ON "permisos_panel" USING btree ("tenant_id","user_id") WHERE user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permisos_panel_invitacion_unq" ON "permisos_panel" USING btree ("invitacion_id") WHERE invitacion_id is not null;--> statement-breakpoint

-- Desde acá, a mano: drizzle-kit no genera RLS ni la FK de tenant.
-- Mismo tratamiento que las otras tablas de negocio (ver 0001 y 0003).
ALTER TABLE "permisos_panel"
  ADD CONSTRAINT "permisos_panel_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "permisos_panel" TO erp_app;
--> statement-breakpoint
ALTER TABLE "permisos_panel" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "permisos_panel" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "permisos_panel"
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));