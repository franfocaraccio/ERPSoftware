import { Cajon, cn, ToggleTema } from "@erp/design-system";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Building2,
  ChevronDown,
  Eye,
  FileText,
  LayoutDashboard,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { hayAccesoPorLink } from "../lib/acceso-consolidado.js";
import {
  AvisoAccesoPorLink,
  MenuUsuario,
  SelectorOrganizacion,
  useRolOrganizacion,
} from "./sesion.js";

interface ItemNav {
  a: string;
  etiqueta: string;
  Icono: typeof Users;
  habilitado: boolean;
}

// Un ítem por módulo del PDF. Los que aún no tienen slice se muestran
// deshabilitados en lugar de ocultarse: el usuario ve el alcance del sistema.
const NAVEGACION: ItemNav[] = [
  { a: "/panel", etiqueta: "Panel", Icono: LayoutDashboard, habilitado: true },
  { a: "/clientes", etiqueta: "Clientes", Icono: Users, habilitado: true },
  { a: "/proveedores", etiqueta: "Proveedores", Icono: Building2, habilitado: true },
  { a: "/stock", etiqueta: "Stock", Icono: Boxes, habilitado: true },
  { a: "/tesoreria", etiqueta: "Tesorería", Icono: Wallet, habilitado: true },
  { a: "/impuestos", etiqueta: "Impuestos", Icono: Receipt, habilitado: true },
  { a: "/comprobantes", etiqueta: "Comprobantes", Icono: FileText, habilitado: true },
];

/**
 * Configuración de la empresa. Es todo lo que se toca de vez en cuando y no
 * forma parte de la operación diaria, así que va agrupado y plegado: son
 * cuatro pantallas que de otro modo compiten en el menú con las que se usan
 * todos los días.
 *
 * Solo la ve el Administrador. Como en el resto de la app, esto es navegación:
 * quien decide de verdad es el backend, que rechaza estos procedures para
 * cualquier otro rol.
 */
const ROL_CONFIGURACION = "administrador";

const CONFIGURACION: ItemNav[] = [
  { a: "/equipo", etiqueta: "Equipo", Icono: UserCog, habilitado: true },
  { a: "/parametros", etiqueta: "Parámetros", Icono: SlidersHorizontal, habilitado: true },
  { a: "/historial", etiqueta: "Historial", Icono: ScrollText, habilitado: true },
  { a: "/accesos", etiqueta: "Accesos", Icono: Eye, habilitado: true },
];

const CLASES_ITEM =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150";

function ItemNavegacion({
  item,
  activo,
  sangria = false,
  onNavegar,
}: {
  item: ItemNav;
  activo: boolean;
  sangria?: boolean;
  // En el cajón hay que cerrarlo al elegir: si no, la pantalla nueva queda
  // tapada por el menú que la abrió.
  onNavegar?: () => void;
}) {
  const { a, etiqueta, Icono, habilitado } = item;

  if (!habilitado) {
    return (
      <span
        aria-disabled="true"
        title="Disponible próximamente"
        className={cn(CLASES_ITEM, "cursor-not-allowed text-muted-foreground/45")}
      >
        <Icono className="size-4 shrink-0" aria-hidden="true" />
        {etiqueta}
      </span>
    );
  }

  return (
    <Link
      to={a}
      aria-current={activo ? "page" : undefined}
      onClick={onNavegar}
      className={cn(
        CLASES_ITEM,
        sangria && "ml-3",
        activo
          ? "bg-primary-subtle text-primary"
          : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icono className="size-4 shrink-0" aria-hidden="true" />
      {etiqueta}
    </Link>
  );
}

function Navegacion({ onNavegar }: { onNavegar?: () => void }) {
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const rol = useRolOrganizacion();
  const idSubmenu = useId();

  const enConfiguracion = CONFIGURACION.some((item) => ruta.startsWith(item.a));
  // Arranca abierto si estás parado en una de sus pantallas: si no, la sección
  // activa quedaría escondida detrás de un menú cerrado.
  const [abierto, setAbierto] = useState(enConfiguracion);

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Módulos">
      {NAVEGACION.map((item) => (
        <ItemNavegacion
          key={item.a}
          item={item}
          activo={ruta.startsWith(item.a)}
          {...(onNavegar ? { onNavegar } : {})}
        />
      ))}

      {rol === ROL_CONFIGURACION && (
        <>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idSubmenu}
            onClick={() => setAbierto((v) => !v)}
            className={cn(
              CLASES_ITEM,
              "mt-2 w-full cursor-pointer",
              // Resaltada si alguna de sus pantallas está activa pero el grupo
              // está plegado: si no, no habría ninguna señal de dónde estás.
              enConfiguracion && !abierto
                ? "bg-primary-subtle text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Settings className="size-4 shrink-0" aria-hidden="true" />
            Configuración
            <ChevronDown
              className={cn(
                "ml-auto size-4 shrink-0 transition-transform duration-150",
                abierto && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {abierto && (
            <div id={idSubmenu} className="flex flex-col gap-0.5">
              {CONFIGURACION.map((item) => (
                <ItemNavegacion
                  key={item.a}
                  item={item}
                  activo={ruta.startsWith(item.a)}
                  sangria
                  {...(onNavegar ? { onNavegar } : {})}
                />
              ))}
            </div>
          )}
        </>
      )}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const porLink = hayAccesoPorLink();
  const [menuAbierto, setMenuAbierto] = useState(false);

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
          {/* En pantallas chicas el menú vive en un cajón: fuera del flujo de
              la página, para no empujar el contenido abajo del fold. */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label="Abrir el menú"
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto(true)}
              className="-ml-1 cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <p className="text-sm font-semibold tracking-tight text-foreground">ERP PyME</p>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            {porLink ? (
              <>
                <ToggleTema />
                <AvisoAccesoPorLink />
              </>
            ) : (
              <>
                <SelectorOrganizacion />
                <ToggleTema />
                <MenuUsuario />
              </>
            )}
          </div>
        </header>

        <Cajon abierto={menuAbierto} onAbiertoChange={setMenuAbierto} titulo="ERP PyME">
          <Navegacion onNavegar={() => setMenuAbierto(false)} />
        </Cajon>

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
