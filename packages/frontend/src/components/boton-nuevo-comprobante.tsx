import { Boton, cn } from "@erp/design-system";
import { ChevronDown, FileUp, Keyboard, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Lectura, leerComprobante } from "../lib/lectura.js";

/**
 * Cargar un comprobante, de las dos formas que hay.
 *
 * Es un solo botón con dos caminos y no dos botones sueltos, porque cargar un
 * comprobante es una sola intención: lo que cambia es de dónde salen los
 * datos. Ventas y compras usan este mismo componente, así que la pantalla se
 * ve igual de los dos lados del mostrador; antes la venta escondía la lectura
 * adentro del formulario y la compra la mostraba en el listado.
 */
export function BotonNuevoComprobante<T extends Lectura>({
  tipo,
  etiqueta,
  onManual,
  onLeido,
}: {
  tipo: T["tipo"];
  /** "Nuevo comprobante" o "Nueva compra": cada pantalla llama a lo suyo. */
  etiqueta: string;
  onManual: () => void;
  onLeido: (lectura: T) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

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

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Se limpia enseguida para que elegir el mismo archivo otra vez vuelva a
    // disparar el change.
    e.target.value = "";
    if (!archivo) {
      return;
    }
    setError(null);
    setLeyendo(true);
    try {
      const lectura =
        tipo === "venta"
          ? await leerComprobante(archivo, "venta")
          : await leerComprobante(archivo, "compra");
      onLeido(lectura as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el comprobante.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <input
        ref={entradaRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => void alElegir(e)}
      />
      <Boton
        tamano="sm"
        cargando={leyendo}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <Plus className="size-4" aria-hidden="true" />
        {leyendo ? "Leyendo el archivo…" : etiqueta}
        <ChevronDown className="size-4" aria-hidden="true" />
      </Boton>

      {abierto && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg",
            "border border-border bg-surface py-1 shadow-[--shadow-popover]",
          )}
        >
          <Opcion
            Icono={Keyboard}
            titulo="Carga manual"
            detalle="Tipear los datos"
            onClick={() => {
              setAbierto(false);
              onManual();
            }}
          />
          <Opcion
            Icono={FileUp}
            titulo="Subir archivo"
            detalle="PDF o foto de la factura"
            onClick={() => {
              setAbierto(false);
              entradaRef.current?.click();
            }}
          />
        </div>
      )}

      {error !== null && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Opcion({
  Icono,
  titulo,
  detalle,
  onClick,
}: {
  Icono: typeof FileUp;
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
    >
      <Icono className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        <span className="block text-sm text-foreground">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{detalle}</span>
      </span>
    </button>
  );
}
