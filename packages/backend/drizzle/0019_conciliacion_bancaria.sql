-- Conciliación bancaria: qué líneas de un extracto ya se procesaron.
-- Escrita a mano e idempotente (ver docs/handoff/tareas.md, "Migraciones").
--
-- Lo normal es bajar "los últimos seis meses" cada mes, así que dos extractos
-- se superponen: son archivos distintos con líneas compartidas. El hash del
-- archivo no alcanza para no duplicar; hay que reconocer cada LÍNEA. La huella
-- es un hash de fecha, importe, saldo y descripción. El saldo la hace casi
-- única: dos líneas del mismo día y el mismo importe dejan saldos distintos.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'resolucion_linea_extracto') THEN
    CREATE TYPE "public"."resolucion_linea_extracto" AS ENUM ('conciliada', 'creada', 'ignorada');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lineas_extracto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"saldo" numeric(14, 2) NOT NULL,
	"huella" text NOT NULL,
	"resolucion" "resolucion_linea_extracto" NOT NULL,
	"movimiento_id" uuid,
	"archivo_hash" text NOT NULL,
	"usuario_id" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	-- Una línea ignorada no tiene movimiento; una conciliada o creada, sí.
	CONSTRAINT "lineas_extracto_movimiento_check"
		CHECK (("resolucion" = 'ignorada') = ("movimiento_id" IS NULL)),
	CONSTRAINT "lineas_extracto_tenant_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE,
	CONSTRAINT "lineas_extracto_cuenta_fk"
		FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id"),
	-- Si se borra el movimiento, la línea vuelve a quedar sin resolver y
	-- aparece en el próximo extracto: lo que la explicaba ya no existe.
	CONSTRAINT "lineas_extracto_movimiento_fk"
		FOREIGN KEY ("movimiento_id") REFERENCES "movimientos"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lineas_extracto_huella_unq"
	ON "lineas_extracto" USING btree ("tenant_id", "cuenta_id", "huella");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lineas_extracto_tenant_cuenta_fecha_idx"
	ON "lineas_extracto" USING btree ("tenant_id", "cuenta_id", "fecha");
--> statement-breakpoint
-- Sin UPDATE: una resolución no se cambia por otra. Con DELETE, para poder
-- deshacer una resolución equivocada y que la línea vuelva a aparecer.
GRANT SELECT, INSERT, DELETE ON "lineas_extracto" TO erp_app;
--> statement-breakpoint
REVOKE UPDATE ON "lineas_extracto" FROM erp_app;
--> statement-breakpoint
ALTER TABLE "lineas_extracto" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lineas_extracto" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'lineas_extracto' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "lineas_extracto"
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END
$$;
