import { Boton, cn, Esqueleto } from "@erp/design-system";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, Check, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { borrarAcceso, cabeceraAcceso, hayAccesoPorLink } from "../lib/acceso-consolidado.js";
import { authClient, ETIQUETA_ROL, useSession } from "../lib/auth.js";
import { useTRPC } from "../lib/trpc.js";

/** Rutas que se ven sin sesión iniciada. */
const RUTAS_PUBLICAS = [
  "/login",
  "/aceptar-invitacion",
  "/recuperar",
  "/restablecer",
  "/consolidado",
];

function esRutaPublica(ruta: string): boolean {
  // La portada se compara exacta: con startsWith, "/" haría pública toda la app.
  return ruta === "/" || RUTAS_PUBLICAS.some((p) => ruta.startsWith(p));
}

/**
 * Portón de acceso: sin sesión manda al login, salvo en las rutas públicas.
 * Los guards de verdad están en el backend; esto es navegación.
 */
export function Guardia({ children }: { children: ReactNode }) {
  const { data: sesion, isPending } = useSession();
  const navigate = useNavigate();
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  // Un acceso por link no tiene cuenta ni cookie: su credencial es el token
  // que la pestaña ya guardó. Para el portón cuenta como entrada válida.
  const porLink = hayAccesoPorLink();
  const publica = esRutaPublica(ruta) || porLink;

  const esAdminPlataforma = sesion?.user.role === "admin";
  const enAdmin = ruta.startsWith("/admin");

  useEffect(() => {
    if (isPending || publica) {
      return;
    }
    if (!sesion) {
      void navigate({ to: "/login" });
      return;
    }
    // Un admin de plataforma no pertenece a ninguna empresa: el ERP no tiene
    // nada que mostrarle. Su lugar es el panel de plataforma.
    if (esAdminPlataforma && !enAdmin) {
      void navigate({ to: "/admin" });
    }
  }, [isPending, sesion, publica, esAdminPlataforma, enAdmin, navigate]);

  if (publica) {
    return <>{children}</>;
  }

  if (isPending || !sesion || (esAdminPlataforma && !enAdmin)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Esqueleto className="h-24 w-64" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Rol del usuario en la organización activa. Es para decidir qué mostrar; los
 * permisos de verdad los aplica el backend en cada procedure.
 */
export function useRolOrganizacion(): string | null {
  const { data: sesion } = useSession();
  const { data: activa } = authClient.useActiveOrganization();
  if (hayAccesoPorLink()) {
    return "solo_lectura";
  }
  if (!sesion || !activa) {
    return null;
  }
  return activa.members?.find((m) => m.userId === sesion.user.id)?.role ?? null;
}

/**
 * True cuando esta pantalla no puede escribir nada: un miembro de solo lectura
 * o alguien que entró por un link de acceso.
 *
 * Es para no mostrar botones que van a fallar. Quien decide de verdad es el
 * backend, que rechaza la escritura por rol.
 */
export function useModoLectura(): boolean {
  return useRolOrganizacion() === "solo_lectura";
}

/** Selector de organización. Solo aparece si el usuario pertenece a más de una. */
export function SelectorOrganizacion() {
  const queryClient = useQueryClient();
  const { data: organizaciones } = authClient.useListOrganizations();
  const { data: activa } = authClient.useActiveOrganization();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) {
      return;
    }
    const alClickAfuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", alClickAfuera);
    return () => document.removeEventListener("mousedown", alClickAfuera);
  }, [abierto]);

  // Con una sola organización el control no aporta nada: no se muestra.
  if (!organizaciones || organizaciones.length <= 1) {
    return null;
  }

  const cambiar = async (organizationId: string) => {
    await authClient.organization.setActive({ organizationId });
    setAbierto(false);
    // Todo lo cargado pertenece al tenant anterior.
    await queryClient.invalidateQueries();
  };

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
      >
        <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-40 truncate">{activa?.name ?? "Elegí una empresa"}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {abierto && (
        <ul
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: patrón ARIA listbox sobre lista, con role="option" en los hijos
          role="listbox"
          aria-label="Empresas"
          className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[--shadow-popover]"
        >
          {organizaciones.map((org) => {
            const seleccionada = org.id === activa?.id;
            return (
              <li key={org.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={seleccionada}
                  onClick={() => void cambiar(org.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    seleccionada
                      ? "bg-primary-subtle text-primary"
                      : "text-foreground hover:bg-surface-muted",
                  )}
                >
                  <span className="truncate">{org.name}</span>
                  {seleccionada && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Aviso para quien entró por un link de acceso. Dice qué está viendo y hasta
 * cuándo: nadie debería tener que adivinar por qué no puede tocar nada.
 */
export function AvisoAccesoPorLink() {
  const trpc = useTRPC();
  const acceso = cabeceraAcceso();
  const [tenantId = "", token = ""] = acceso
    ? [acceso.slice(0, acceso.indexOf(":")), acceso.slice(acceso.indexOf(":") + 1)]
    : [];
  const { data } = useQuery({
    ...trpc.consolidado.abrir.queryOptions({ tenantId, token }),
    enabled: Boolean(acceso),
    retry: false,
  });

  if (!acceso) {
    return null;
  }

  const salir = () => {
    borrarAcceso();
    window.location.assign("/");
  };

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-xs font-medium text-foreground">
          {data?.empresa ?? "Acceso de solo lectura"}
        </p>
        <p className="text-xs text-muted-foreground">
          Solo lectura{data?.expira ? ` · vence ${formatearVencimiento(data.expira)}` : ""}
        </p>
      </div>
      <Boton variante="secundario" tamano="sm" onClick={salir}>
        <LogOut className="size-4" aria-hidden="true" />
        Salir
      </Boton>
    </div>
  );
}

function formatearVencimiento(valor: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(valor));
}

/** Menú del usuario con su rol y el cierre de sesión. */
export function MenuUsuario() {
  const { data: sesion } = useSession();
  const { data: activa } = authClient.useActiveOrganization();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) {
      return;
    }
    const alClickAfuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", alClickAfuera);
    return () => document.removeEventListener("mousedown", alClickAfuera);
  }, [abierto]);

  if (!sesion) {
    return null;
  }

  const rol = activa?.members?.find((m) => m.userId === sesion.user.id)?.role;
  const esAdminPlataforma = sesion.user.role === "admin";

  const salir = async () => {
    await authClient.signOut();
    queryClient.clear();
    // Carga completa: descarta cualquier estado del tenant anterior.
    window.location.assign("/login");
  };

  const iniciales = sesion.user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Menú de usuario"
        className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary transition-colors hover:bg-primary-subtle/70"
      >
        {iniciales || "?"}
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-surface shadow-[--shadow-popover]"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{sesion.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{sesion.user.email}</p>
            {rol && ETIQUETA_ROL[rol] && (
              <p className="mt-1 text-xs text-muted-foreground">Rol: {ETIQUETA_ROL[rol]}</p>
            )}
          </div>

          {esAdminPlataforma && (
            <Link
              to="/admin"
              onClick={() => setAbierto(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              Panel de plataforma
            </Link>
          )}

          <div className="border-t border-border p-1">
            <Boton
              variante="fantasma"
              tamano="sm"
              className="w-full justify-start"
              onClick={() => void salir()}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
