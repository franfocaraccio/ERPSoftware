import { cn } from "@erp/design-system";
import { AlignJustify, Rows3 } from "lucide-react";
import { DENSIDADES, type Densidad, ETIQUETA_DENSIDAD } from "../lib/densidad.js";

const ICONO: Record<Densidad, typeof Rows3> = {
  comoda: Rows3,
  compacta: AlignJustify,
};

/**
 * Elige cuánto aire tiene la tabla. Dos modos alcanzan: el problema que esto
 * resuelve es que la información no entra, así que el modo útil es el compacto;
 * el cómodo es lo que ya había.
 *
 * Para el caso inverso —alguien que quiere todo más grande— el zoom del
 * navegador funciona bien y no rompe nada, a diferencia de achicarlo.
 *
 * Son botones con `aria-pressed` y no un grupo de radios: un radiogroup de
 * verdad necesita tabindex rotativo y manejo de flechas, y con dos opciones no
 * paga ese costo. Así cada botón es un tab-stop común y el lector de pantalla
 * anuncia cuál está activo.
 *
 * El contenedor es un `fieldset` con `legend` y no un `div role="group"`: el
 * elemento nativo ya tiene esa semántica y no hay que declararla a mano.
 */
export function SelectorDensidad({
  valor,
  onCambio,
}: {
  valor: Densidad;
  onCambio: (densidad: Densidad) => void;
}) {
  return (
    <fieldset className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5">
      <legend className="sr-only">Densidad de la tabla</legend>
      {DENSIDADES.map((densidad) => {
        const Icono = ICONO[densidad];
        const activo = valor === densidad;
        return (
          <button
            key={densidad}
            type="button"
            aria-pressed={activo}
            // El title repite la etiqueta porque el botón es solo ícono: sin
            // esto, en el hover no hay forma de saber cuál es cuál.
            title={ETIQUETA_DENSIDAD[densidad]}
            onClick={() => onCambio(densidad)}
            className={cn(
              "inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
              activo
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icono className="size-4" aria-hidden="true" />
            <span className="sr-only">{ETIQUETA_DENSIDAD[densidad]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
