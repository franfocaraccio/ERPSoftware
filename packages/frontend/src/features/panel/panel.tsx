import { Tarjeta } from "@erp/design-system";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Building2, FileText, Receipt, Users, Wallet } from "lucide-react";
import { EncabezadoPagina } from "../../components/layout.js";

const MODULOS = [
  {
    a: "/clientes",
    titulo: "Clientes",
    descripcion: "Padrón, condición fiscal y límite de crédito.",
    Icono: Users,
  },
  {
    a: "/proveedores",
    titulo: "Proveedores",
    descripcion: "Condiciones de pago y saldo pendiente.",
    Icono: Building2,
  },
  {
    a: "/stock",
    titulo: "Stock",
    descripcion: "Niveles de reposición y capital inmovilizado.",
    Icono: Boxes,
  },
  {
    a: "/tesoreria",
    titulo: "Tesorería",
    descripcion: "Saldos por cuenta, movimientos y cheques.",
    Icono: Wallet,
  },
  {
    a: "/impuestos",
    titulo: "Impuestos",
    descripcion: "Vencimientos y saldos por obligación.",
    Icono: Receipt,
  },
  {
    a: "/comprobantes",
    titulo: "Comprobantes",
    descripcion: "Facturación de ventas y compras recibidas.",
    Icono: FileText,
  },
] as const;

/**
 * Panel de acceso a los módulos. Los KPIs, la proyección de caja a 13 semanas
 * y la Vista Consolidada corresponden a la Fase 2 (secciones 8 y 9 del PDF).
 */
export function Panel() {
  return (
    <>
      <EncabezadoPagina
        titulo="Panel"
        descripcion="Resumen de la operación. Los indicadores financieros llegan en la próxima fase."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULOS.map(({ a, titulo, descripcion, Icono }) => (
          <Link key={a} to={a} className="group">
            <Tarjeta className="h-full p-5 transition-colors duration-150 group-hover:border-border-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{titulo}</p>
                  <p className="text-sm text-muted-foreground">{descripcion}</p>
                </div>
                <Icono className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Ir al módulo
                <ArrowRight
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Tarjeta>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Tarjeta className="border-dashed p-5">
          <p className="font-medium text-muted-foreground">Indicadores financieros</p>
          <p className="mt-1 text-sm text-muted-foreground/80">
            Liquidez, DSO, DPO, rotación de stock y margen bruto.
          </p>
          <p className="mt-4 text-xs text-muted-foreground/70">Disponible en la Fase 2</p>
        </Tarjeta>

        <Tarjeta className="border-dashed p-5">
          <p className="font-medium text-muted-foreground">Proyección de caja</p>
          <p className="mt-1 text-sm text-muted-foreground/80">
            Trece semanas móviles con semáforo sobre el mínimo operativo.
          </p>
          <p className="mt-4 text-xs text-muted-foreground/70">Disponible en la Fase 2</p>
        </Tarjeta>
      </div>
    </>
  );
}
