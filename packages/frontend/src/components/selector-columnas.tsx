import { cn } from "@erp/design-system";
import { Check, Columns3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ColumnaElegible {
  id: string;
  etiqueta: string;
  visible: boolean;
  /** Las que identifican la fila no se pueden esconder: dejarían la tabla muda. */
  sePuedeEsconder: boolean;
}

/**
 * Elige qué columnas se ven.
 *
 * Es el complemento del selector de densidad: la densidad hace que entre más en
 * el mismo ancho, esto saca lo que a cada uno no le interesa. Entre los dos
 * resuelven lo mismo que el zoom del navegador, sin achicar la letra.
 *
 * La columna que identifica la fila —razón social, SKU— no aparece como
 * opción: sin ella la tabla no dice de qué está hablando.
 */
export function SelectorColumnas({
  columnas,
  onAlternar,
  onMostrarTodas,
}: {
  columnas: ColumnaElegible[];
  onAlternar: (id: string) => void;
  onMostrarTodas: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) {
      return;
    }
    const cerrar = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const conEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [abierto]);

  const elegibles = columnas.filter((c) => c.sePuedeEsconder);
  const escondidas = elegibles.filter((c) => !c.visible).length;

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Elegir columnas"
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border",
          "bg-surface-muted px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
        )}
      >
        <Columns3 className="size-4" aria-hidden="true" />
        <span className="sr-only">Elegir columnas</span>
        {/* El contador avisa que hay datos fuera de la vista. Sin esto, alguien
            que escondió algo y se olvidó cree que la tabla no lo tiene. */}
        {escondidas > 0 && <span className="tabular">{escondidas}</span>}
      </button>

      {abierto && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-20 mt-1 max-h-80 w-56 overflow-auto rounded-lg",
            "border border-border bg-surface py-1 shadow-[--shadow-popover]",
          )}
        >
          {elegibles.map((columna) => (
            <button
              key={columna.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={columna.visible}
              onClick={() => onAlternar(columna.id)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <Check
                className={cn("size-4 shrink-0", columna.visible ? "text-primary" : "opacity-0")}
                aria-hidden="true"
              />
              <span className="truncate">{columna.etiqueta}</span>
            </button>
          ))}

          {escondidas > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={onMostrarTodas}
              className="mt-1 w-full cursor-pointer border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              Mostrar todas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
