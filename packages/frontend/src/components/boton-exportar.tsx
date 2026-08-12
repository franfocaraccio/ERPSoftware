import { Boton, cn } from "@erp/design-system";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ColumnaExport, descargarCsv, descargarExcel } from "../lib/exportar.js";

interface Props<T> {
  /** Trae TODAS las filas que matchean los filtros activos, no la página visible. */
  traerFilas: () => Promise<{ items: T[]; truncado: boolean }>;
  columnas: ColumnaExport<T>[];
  /** Base del nombre del archivo; se le agrega la fecha. */
  nombre: string;
}

/**
 * Botón de exportar, abajo a la derecha de una tabla.
 *
 * Las filas las trae en el momento del clic y no las tiene precargadas: lo que
 * se exporta es todo lo que matchea los filtros activos, que casi nunca es la
 * página que se está viendo.
 */
export function BotonExportar<T>({ traerFilas, columnas, nombre }: Props<T>) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
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
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  async function exportar(formato: "excel" | "csv") {
    setAbierto(false);
    setOcupado(true);
    setAviso(null);
    try {
      const { items, truncado } = await traerFilas();

      if (items.length === 0) {
        setAviso("No hay filas para exportar con los filtros actuales.");
        return;
      }

      if (formato === "excel") {
        await descargarExcel(items, columnas, nombre);
      } else {
        descargarCsv(items, columnas, nombre);
      }

      // Un archivo incompleto con cara de completo es peor que un error.
      if (truncado) {
        setAviso(
          `Se exportaron las primeras ${items.length} filas. Afiná los filtros para el resto.`,
        );
      }
    } catch {
      setAviso("No se pudo exportar. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {aviso && (
        <p className="text-xs text-muted-foreground" role="status">
          {aviso}
        </p>
      )}

      <div ref={contenedorRef} className="relative">
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={() => setAbierto((a) => !a)}
          cargando={ocupado}
          aria-haspopup="menu"
          aria-expanded={abierto}
        >
          {!ocupado && <Download className="size-4" aria-hidden="true" />}
          Exportar
        </Boton>

        {abierto && (
          <div
            role="menu"
            className={cn(
              "absolute right-0 bottom-full z-20 mb-1 w-44 overflow-hidden rounded-lg",
              "border border-border bg-surface shadow-[--shadow-popover]",
            )}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => exportar("excel")}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
              Excel
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => exportar("csv")}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
              CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
