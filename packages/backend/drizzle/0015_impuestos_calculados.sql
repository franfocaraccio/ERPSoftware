-- Etapa 3 del análisis: régimen fiscal, IVA calculado desde los comprobantes,
-- importes fijos (monotributo, anticipos de Ganancias) y retenciones de IIBB.
-- Escrita a mano e idempotente (ver docs/handoff/tareas.md, "Migraciones").

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'regimen_fiscal') THEN
    CREATE TYPE "public"."regimen_fiscal" AS ENUM ('responsable_inscripto', 'monotributo');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'tipo_retencion_iibb') THEN
    CREATE TYPE "public"."tipo_retencion_iibb" AS ENUM ('retencion', 'percepcion', 'sircreb');
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "parametros"
  ADD COLUMN IF NOT EXISTS "regimen_fiscal" "regimen_fiscal" DEFAULT 'responsable_inscripto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "parametros"
  ADD COLUMN IF NOT EXISTS "dia_vencimiento_iva" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint

-- Un impuesto puede determinarse por base × alícuota o por un importe fijo:
-- base y alícuota dejan de ser obligatorias.
ALTER TABLE "impuestos" ALTER COLUMN "base_imponible" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "impuestos" ALTER COLUMN "alicuota" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "impuestos" ADD COLUMN IF NOT EXISTS "importe_fijo" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "impuestos" ADD COLUMN IF NOT EXISTS "concepto" text;
--> statement-breakpoint
ALTER TABLE "impuestos" ADD COLUMN IF NOT EXISTS "calculado" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "retenciones_iibb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"fecha" date NOT NULL,
	"periodo" date NOT NULL,
	"tipo" "tipo_retencion_iibb" NOT NULL,
	"agente" text,
	"comprobante" text,
	"importe" numeric(14, 2) NOT NULL,
	CONSTRAINT "retenciones_iibb_importe_check" CHECK ("importe" > 0),
	CONSTRAINT "retenciones_iibb_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retenciones_iibb_tenant_periodo_idx" ON "retenciones_iibb" USING btree ("tenant_id","periodo");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "retenciones_iibb" TO erp_app;
--> statement-breakpoint
ALTER TABLE "retenciones_iibb" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "retenciones_iibb" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE tablename = 'retenciones_iibb' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "retenciones_iibb"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END
$$;
