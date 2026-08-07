import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../lib/cn.js";

export interface CasillaProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
  etiqueta: string;
  ayuda?: string | undefined;
}

/**
 * Casilla de verificación. Es un `<input type="checkbox">` de verdad —con el
 * control nativo escondido pero presente— para no perder el manejo del teclado,
 * el estado indeterminado ni el anuncio del lector de pantalla.
 *
 * El área táctil la da el label completo, que envuelve control y texto.
 */
export function Casilla({ etiqueta, ayuda, className, id, ...props }: CasillaProps) {
  const idGenerado = useId();
  const idCasilla = id ?? idGenerado;
  const idAyuda = `${idCasilla}-ayuda`;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={idCasilla}
        className="group flex cursor-pointer items-center gap-2.5 py-1 text-sm text-foreground"
      >
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <input
            id={idCasilla}
            type="checkbox"
            aria-describedby={ayuda ? idAyuda : undefined}
            className="peer size-5 cursor-pointer appearance-none rounded-md border border-border-strong bg-surface transition-colors checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            {...props}
          />
          <Check
            aria-hidden="true"
            className="pointer-events-none absolute size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
          />
        </span>
        {etiqueta}
      </label>
      {ayuda && (
        <p id={idAyuda} className="pl-7.5 text-xs text-muted-foreground">
          {ayuda}
        </p>
      )}
    </div>
  );
}
