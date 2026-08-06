import { cn, ToggleTema } from "@erp/design-system";
import { Link, useRouterState } from "@tanstack/react-router";
import { Boxes, Building2, FileText, LayoutDashboard, Receipt, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

interface ItemNav {
  a: string;
  etiqueta: string;
  Icono: typeof Users;
  habilitado: boolean;
}

// Un ítem por módulo del PDF. Los que aún no tienen slice se muestran
// deshabilitados en lugar de ocultarse: el usuario ve el alcance del sistema.
const NAVEGACION: ItemNav[] = [
  { a: "/", etiqueta: "Panel", Icono: LayoutDashboard, habilitado: true },
  { a: "/clientes", etiqueta: "Clientes", Icono: Users, habilitado: true },
  { a: "/proveedores", etiqueta: "Proveedores", Icono: Building2, habilitado: true },
  { a: "/stock", etiqueta: "Stock", Icono: Boxes, habilitado: false },
  { a: "/tesoreria", etiqueta: "Tesorería", Icono: Wallet, habilitado: false },
  { a: "/impuestos", etiqueta: "Impuestos", Icono: Receipt, habilitado: false },
  { a: "/comprobantes", etiqueta: "Comprobantes", Icono: FileText, habilitado: false },
];

function Navegacion() {
  const ruta = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Módulos">
      {NAVEGACION.map(({ a, etiqueta, Icono, habilitado }) => {
        const activo = a === "/" ? ruta === "/" : ruta.startsWith(a);
        const clases = cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        );

        if (!habilitado) {
          return (
            <span
              key={a}
              aria-disabled="true"
              title="Disponible próximamente"
              className={cn(clases, "cursor-not-allowed text-muted-foreground/45")}
            >
              <Icono className="size-4 shrink-0" aria-hidden="true" />
              {etiqueta}
            </span>
          );
        }

        return (
          <Link
            key={a}
            to={a}
            aria-current={activo ? "page" : undefined}
            className={cn(
              clases,
              activo
                ? "bg-primary-subtle text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icono className="size-4 shrink-0" aria-hidden="true" />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar: navegación secundaria persistente en pantallas grandes. */}
      <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col lg:gap-6 lg:py-5">
        <div className="px-6">
          <p className="text-sm font-semibold tracking-tight text-foreground">ERP PyME</p>
          <p className="text-xs text-muted-foreground">Gestión integral</p>
        </div>
        <Navegacion />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm sm:px-6">
          <p className="text-sm font-semibold tracking-tight text-foreground lg:hidden">ERP PyME</p>
          <div className="hidden lg:block" />
          <ToggleTema />
        </header>

        {/* Navegación horizontal en pantallas chicas (el sidebar se oculta). */}
        <div className="overflow-x-auto border-b border-border bg-surface py-2 lg:hidden">
          <Navegacion />
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  );
}
