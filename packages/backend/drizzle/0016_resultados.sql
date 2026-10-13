-- Etapa 4 del análisis: categorías de ingresos y gastos, gastos recurrentes, y
-- la categoría en movimientos y compras para el estado de resultados.
-- Escrita a mano e idempotente (ver docs/handoff/tareas.md, "Migraciones").

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'tipo_categoria') THEN
    CREATE TYPE "public"."tipo_categoria" AS ENUM ('gasto', 'ingreso');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_categoria" NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categorias_tenant_nombre_tipo_unq" ON "categorias" USING btree ("tenant_id","tipo","nombre");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gastos_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"descripcion" text NOT NULL,
	"categoria_id" uuid,
	"cuenta_id" uuid NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"dia_del_mes" integer NOT NULL,
	"desde" date NOT NULL,
	"hasta" date,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "gastos_recurrentes_importe_check" CHECK ("importe" > 0),
	CONSTRAINT "gastos_recurrentes_dia_check" CHECK ("dia_del_mes" BETWEEN 1 AND 31),
	CONSTRAINT "gastos_recurrentes_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE,
	CONSTRAINT "gastos_recurrentes_categoria_fk"
		FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id"),
	CONSTRAINT "gastos_recurrentes_cuenta_fk"
		FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gastos_recurrentes_tenant_idx" ON "gastos_recurrentes" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "categoria_id" uuid;
--> statement-breakpoint
ALTER TABLE "comprobantes_compra" ADD COLUMN IF NOT EXISTS "categoria_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conname = 'movimientos_categoria_fk') THEN
    ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_fk"
      FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id");
  END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conname = 'comprobantes_compra_categoria_fk') THEN
    ALTER TABLE "comprobantes_compra" ADD CONSTRAINT "comprobantes_compra_categoria_fk"
      FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id");
  END IF;
END
$$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "categorias" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "gastos_recurrentes" TO erp_app;
--> statement-breakpoint
ALTER TABLE "categorias" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categorias" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'categorias' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "categorias"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'gastos_recurrentes' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "gastos_recurrentes"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END
$$;
