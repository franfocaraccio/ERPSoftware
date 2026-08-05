CREATE TYPE "public"."accion_auditoria" AS ENUM('alta', 'modificacion', 'baja', 'transicion_estado');--> statement-breakpoint
CREATE TYPE "public"."estado_cliente" AS ENUM('activo', 'inactivo', 'en_mora');--> statement-breakpoint
CREATE TYPE "public"."clase_comprobante" AS ENUM('factura', 'nota_credito', 'nota_debito');--> statement-breakpoint
CREATE TYPE "public"."estado_comprobante" AS ENUM('borrador', 'enviada', 'aprobada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."letra_comprobante" AS ENUM('A', 'B', 'C', 'E');--> statement-breakpoint
CREATE TYPE "public"."tipo_impuesto" AS ENUM('iva', 'iibb', 'ganancias', 'monotributo', 'otros');--> statement-breakpoint
CREATE TYPE "public"."alicuota_iva" AS ENUM('0', '2.5', '5', '10.5', '21', '27', 'exento', 'no_gravado');--> statement-breakpoint
CREATE TYPE "public"."condicion_iva" AS ENUM('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final');--> statement-breakpoint
CREATE TYPE "public"."moneda" AS ENUM('ARS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."estado_cheque" AS ENUM('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('efectivo', 'transferencia', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."tipo_cuenta" AS ENUM('efectivo', 'cuenta_corriente', 'caja_ahorro');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"usuario_id" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" uuid,
	"accion" "accion_auditoria" NOT NULL,
	"detalle" jsonb
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"razon_social" text NOT NULL,
	"cuit" text,
	"condicion_iva" "condicion_iva" NOT NULL,
	"email" text,
	"telefono" text,
	"direccion" text,
	"limite_credito" numeric(14, 2),
	"estado" "estado_cliente" DEFAULT 'activo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"letra" "letra_comprobante",
	"numero_completo" text,
	"fecha_emision" date,
	"fecha_recepcion" date NOT NULL,
	"condicion_pago_dias" integer DEFAULT 0 NOT NULL,
	"concepto" text,
	"moneda" "moneda" DEFAULT 'ARS' NOT NULL,
	"neto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"adjunto_path" text
);
--> statement-breakpoint
CREATE TABLE "comprobantes_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clase" "clase_comprobante" DEFAULT 'factura' NOT NULL,
	"letra" "letra_comprobante" NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer,
	"cliente_id" uuid NOT NULL,
	"fecha_emision" date NOT NULL,
	"condicion_iva_receptor" "condicion_iva" NOT NULL,
	"condicion_venta_dias" integer DEFAULT 0 NOT NULL,
	"estado" "estado_comprobante" DEFAULT 'borrador' NOT NULL,
	"moneda" "moneda" DEFAULT 'ARS' NOT NULL,
	"neto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cae" text,
	"cae_vencimiento" date,
	"pdf_path" text
);
--> statement-breakpoint
CREATE TABLE "items_comprobante_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"precio_unitario" numeric(14, 4) NOT NULL,
	"alicuota_iva" "alicuota_iva" NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "items_comprobante_venta_cantidad_check" CHECK ("items_comprobante_venta"."cantidad" <> 0)
);
--> statement-breakpoint
CREATE TABLE "impuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" "tipo_impuesto" NOT NULL,
	"periodo" date NOT NULL,
	"base_imponible" numeric(14, 2) NOT NULL,
	"alicuota" numeric(6, 3) NOT NULL,
	"importe_pagado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"comprobante_pago_path" text,
	CONSTRAINT "impuestos_alicuota_check" CHECK ("impuestos"."alicuota" >= 0)
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"umbral_mora_dias" integer DEFAULT 60 NOT NULL,
	"margen_objetivo" numeric(5, 2),
	"minimo_operativo" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"razon_social" text NOT NULL,
	"cuit" text,
	"condicion_iva" "condicion_iva" NOT NULL,
	"rubro" text,
	"condicion_pago_dias" integer DEFAULT 0 NOT NULL,
	"cbu" text,
	"alias_cbu" text,
	"email" text,
	"telefono" text
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sku" text NOT NULL,
	"descripcion" text NOT NULL,
	"categoria" text,
	"costo_unitario" numeric(14, 2),
	"precio_venta" numeric(14, 2),
	"moneda" "moneda" DEFAULT 'ARS' NOT NULL,
	"stock_actual" numeric(14, 3) DEFAULT '0' NOT NULL,
	"stock_minimo" numeric(14, 3) DEFAULT '0' NOT NULL,
	"proveedor_principal_id" uuid
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"numero" text NOT NULL,
	"librador_cliente_id" uuid,
	"librador_nombre" text,
	"banco" text,
	"fecha_emision" date,
	"fecha_pago" date NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"estado" "estado_cheque" DEFAULT 'en_cartera' NOT NULL,
	CONSTRAINT "cheques_importe_check" CHECK ("cheques"."importe" > 0),
	CONSTRAINT "cheques_librador_check" CHECK ("cheques"."librador_cliente_id" is not null or "cheques"."librador_nombre" is not null)
);
--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_cuenta" NOT NULL,
	"moneda" "moneda" DEFAULT 'ARS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha" date NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"medio_pago" "medio_pago" NOT NULL,
	"concepto" text,
	"importe" numeric(14, 2) NOT NULL,
	"cliente_id" uuid,
	"proveedor_id" uuid,
	"comprobante_venta_id" uuid,
	"comprobante_compra_id" uuid,
	"cheque_id" uuid,
	"conciliado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "movimientos_importe_check" CHECK ("movimientos"."importe" > 0)
);
--> statement-breakpoint
ALTER TABLE "comprobantes_compra" ADD CONSTRAINT "comprobantes_compra_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_venta" ADD CONSTRAINT "comprobantes_venta_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_comprobante_venta" ADD CONSTRAINT "items_comprobante_venta_comprobante_id_comprobantes_venta_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes_venta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_comprobante_venta" ADD CONSTRAINT "items_comprobante_venta_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedor_principal_id_proveedores_id_fk" FOREIGN KEY ("proveedor_principal_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_librador_cliente_id_clientes_id_fk" FOREIGN KEY ("librador_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_comprobante_venta_id_comprobantes_venta_id_fk" FOREIGN KEY ("comprobante_venta_id") REFERENCES "public"."comprobantes_venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_comprobante_compra_id_comprobantes_compra_id_fk" FOREIGN KEY ("comprobante_compra_id") REFERENCES "public"."comprobantes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_fecha_idx" ON "audit_log" USING btree ("tenant_id","fecha");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_tabla_registro_idx" ON "audit_log" USING btree ("tenant_id","tabla","registro_id");--> statement-breakpoint
CREATE INDEX "clientes_tenant_idx" ON "clientes" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_tenant_cuit_unq" ON "clientes" USING btree ("tenant_id","cuit") WHERE "clientes"."cuit" is not null;--> statement-breakpoint
CREATE INDEX "comprobantes_compra_tenant_idx" ON "comprobantes_compra" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "comprobantes_compra_tenant_proveedor_idx" ON "comprobantes_compra" USING btree ("tenant_id","proveedor_id");--> statement-breakpoint
CREATE INDEX "comprobantes_compra_tenant_recepcion_idx" ON "comprobantes_compra" USING btree ("tenant_id","fecha_recepcion");--> statement-breakpoint
CREATE INDEX "comprobantes_venta_tenant_idx" ON "comprobantes_venta" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "comprobantes_venta_tenant_cliente_idx" ON "comprobantes_venta" USING btree ("tenant_id","cliente_id");--> statement-breakpoint
CREATE INDEX "comprobantes_venta_tenant_estado_idx" ON "comprobantes_venta" USING btree ("tenant_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_venta_numeracion_unq" ON "comprobantes_venta" USING btree ("tenant_id","clase","letra","punto_venta","numero") WHERE "comprobantes_venta"."numero" is not null;--> statement-breakpoint
CREATE INDEX "items_comprobante_venta_tenant_idx" ON "items_comprobante_venta" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "items_comprobante_venta_comprobante_idx" ON "items_comprobante_venta" USING btree ("tenant_id","comprobante_id");--> statement-breakpoint
CREATE INDEX "impuestos_tenant_idx" ON "impuestos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "impuestos_tenant_tipo_periodo_idx" ON "impuestos" USING btree ("tenant_id","tipo","periodo");--> statement-breakpoint
CREATE INDEX "impuestos_tenant_vencimiento_idx" ON "impuestos" USING btree ("tenant_id","fecha_vencimiento");--> statement-breakpoint
CREATE UNIQUE INDEX "parametros_tenant_unq" ON "parametros" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "proveedores_tenant_idx" ON "proveedores" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proveedores_tenant_cuit_unq" ON "proveedores" USING btree ("tenant_id","cuit") WHERE "proveedores"."cuit" is not null;--> statement-breakpoint
CREATE INDEX "productos_tenant_idx" ON "productos" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_tenant_sku_unq" ON "productos" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "cheques_tenant_idx" ON "cheques" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cheques_tenant_estado_fecha_idx" ON "cheques" USING btree ("tenant_id","estado","fecha_pago");--> statement-breakpoint
CREATE INDEX "cuentas_tenant_idx" ON "cuentas" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_tenant_nombre_unq" ON "cuentas" USING btree ("tenant_id","nombre");--> statement-breakpoint
CREATE INDEX "movimientos_tenant_idx" ON "movimientos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "movimientos_tenant_cuenta_fecha_idx" ON "movimientos" USING btree ("tenant_id","cuenta_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_tenant_cliente_idx" ON "movimientos" USING btree ("tenant_id","cliente_id");--> statement-breakpoint
CREATE INDEX "movimientos_tenant_proveedor_idx" ON "movimientos" USING btree ("tenant_id","proveedor_id");