import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
type Tamano = "sm" | "md" | "icono";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secundario: "bg-surface text-foreground border border-border-strong hover:bg-surface-muted",
  fantasma: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
  peligro: "bg-danger text-danger-foreground hover:bg-danger-hover",
};

// Alturas ≥ 36px; el tamaño icono llega a 44px de área táctil con el padding.
const TAMANOS: Record<Tamano, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  icono: "h-10 w-10 justify-center",
};

const BASE =
  "inline-flex cursor-pointer items-center rounded-lg font-medium transition-colors duration-150";

/**
 * Las clases del botón, sin el elemento.
 *
 * Sirve para que un enlace se vea como botón sin envolver un `<button>` dentro
 * de un `<a>`: eso anida dos elementos interactivos, duplica la parada de
 * tabulación y confunde a los lectores de pantalla. Un CTA que navega es un
 * enlace; uno que ejecuta algo es un botón.
 */
export function clasesBoton(variante: Variante = "primario", tamano: Tamano = "md"): string {
  return cn(BASE, VARIANTES[variante], TAMANOS[tamano]);
}

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  children?: ReactNode;
}

export function Boton({
  variante = "primario",
  tamano = "md",
  cargando = false,
  disabled,
  className,
  children,
  ...props
}: BotonProps) {
  const inactivo = disabled || cargando;
  return (
    <button
      type="button"
      disabled={inactivo}
      aria-busy={cargando || undefined}
      className={cn(
        BASE,
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    >
      {cargando && (
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
