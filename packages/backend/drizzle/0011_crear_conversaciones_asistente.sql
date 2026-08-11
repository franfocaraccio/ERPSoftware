CREATE TYPE "public"."rol_mensaje_asistente" AS ENUM('user', 'assistant');
--> statement-breakpoint
CREATE TABLE "asistente_conversaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"usuario_id" text,
	"creada" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_mensaje" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asistente_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"rol" "rol_mensaje_asistente" NOT NULL,
	"contenido" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"tokens_cache" integer
);
--> statement-breakpoint
CREATE INDEX "asistente_conversaciones_tenant_idx" ON "asistente_conversaciones" USING btree ("tenant_id","ultimo_mensaje");--> statement-breakpoint
CREATE INDEX "asistente_mensajes_conversacion_idx" ON "asistente_mensajes" USING btree ("tenant_id","conversacion_id","creado");--> statement-breakpoint

-- A mano: drizzle-kit no genera RLS ni la FK de tenant (ver 0001 y 0003).
ALTER TABLE "asistente_conversaciones"
  ADD CONSTRAINT "asistente_conversaciones_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "asistente_mensajes"
  ADD CONSTRAINT "asistente_mensajes_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Borrar la conversación se lleva sus mensajes: hacen falta juntos o no sirven.
ALTER TABLE "asistente_mensajes"
  ADD CONSTRAINT "asistente_mensajes_conversacion_fk"
  FOREIGN KEY ("conversacion_id") REFERENCES "asistente_conversaciones"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- La conversación se actualiza (ultimo_mensaje); los mensajes no se tocan una
-- vez escritos, igual que el audit log: sin UPDATE, un bug no puede reescribir
-- lo que alguien preguntó. El DELETE queda para poder purgar por retención.
--
-- El REVOKE es imprescindible y no alcanza con otorgar de menos: 0001 dejó un
-- ALTER DEFAULT PRIVILEGES que le da SELECT/INSERT/UPDATE/DELETE a erp_app
-- sobre TODA tabla nueva de este schema. Escribir solo el GRANT acotado no
-- quita nada — se comprobó que el UPDATE pasaba igual — y es la misma razón
-- por la que 0001 revoca explícitamente sobre audit_log.
GRANT SELECT, INSERT, UPDATE, DELETE ON "asistente_conversaciones" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "asistente_mensajes" TO erp_app;
--> statement-breakpoint
REVOKE UPDATE ON "asistente_mensajes" FROM erp_app;
--> statement-breakpoint

ALTER TABLE "asistente_conversaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asistente_conversaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "asistente_conversaciones"
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint

ALTER TABLE "asistente_mensajes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asistente_mensajes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "asistente_mensajes"
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
