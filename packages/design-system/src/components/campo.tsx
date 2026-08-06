import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../lib/cn.js";

const CONTROL_BASE =
  "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-foreground transition-colors " +
  "placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50";

interface CampoBaseProps {
  etiqueta: string;
  ayuda?: string | undefined;
  error?: string | undefined;
  requerido?: boolean | undefined;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalido: boolean;
  }) => ReactNode;
}

/**
 * Envoltorio de campo de formulario: etiqueta visible (nunca placeholder como
 * etiqueta), texto de ayuda persistente y error debajo del control, anunciado
 * por lectores de pantalla.
 */
export function Campo({ etiqueta, ayuda, error, requerido, children }: CampoBaseProps) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {etiqueta}
        {requerido && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy: describedBy || undefined, invalido: Boolean(error) })}
      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  invalido?: boolean;
}

export function Entrada({ invalido, className, ...props }: EntradaProps) {
  return (
    <input
      aria-invalid={invalido || undefined}
      className={cn(
        CONTROL_BASE,
        invalido ? "border-danger" : "border-border-strong",
        "focus:border-ring",
        className,
      )}
      {...props}
    />
  );
}

export interface SelectorProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalido?: boolean;
}

export function Selector({ invalido, className, children, ...props }: SelectorProps) {
  return (
    <select
      aria-invalid={invalido || undefined}
      className={cn(
        CONTROL_BASE,
        "cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        invalido ? "border-danger" : "border-border-strong",
        "focus:border-ring",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
