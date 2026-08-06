import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export function Tarjeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[--radius-card] border border-border bg-surface shadow-[--shadow-card]",
        className,
      )}
      {...props}
    />
  );
}

type TonoInsignia = "neutro" | "exito" | "advertencia" | "peligro" | "info";

const TONOS: Record<TonoInsignia, string> = {
  neutro: "bg-surface-muted text-muted-foreground",
  exito: "bg-success-subtle text-success",
  advertencia: "bg-warning-subtle text-warning",
  peligro: "bg-danger-subtle text-danger",
  info: "bg-primary-subtle text-primary",
};

/**
 * Estado con color + texto. El color nunca es el único portador de significado
 * (regla de accesibilidad: color-not-only).
 */
export function Insignia({
  tono = "neutro",
  children,
  className,
}: {
  tono?: TonoInsignia;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icono && <div className="text-muted-foreground/60">{icono}</div>}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{titulo}</p>
        {descripcion && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{descripcion}</p>
        )}
      </div>
      {accion}
    </div>
  );
}

/** Placeholder de carga: reserva el espacio para no provocar saltos de layout. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}
