import { Boton, Campo, cn, Entrada, Selector } from "@erp/design-system";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";
import type { ReactNode } from "react";

export type Direccion = "asc" | "desc";

/**
 * Rango de fechas con el calendario nativo del sistema.
 *
 * `input type="date"` da el calendario, el formato y el idioma del sistema
 * operativo, funciona con teclado y no agrega peso al bundle. Un date-picker
 * propio sería más código para hacer peor lo mismo.
 */
export function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
  etiquetaDesde = "Desde",
  etiquetaHasta = "Hasta",
}: {
  desde: string;
  hasta: string;
  onDesde: (valor: string) => void;
  onHasta: (valor: string) => void;
  etiquetaDesde?: string;
  etiquetaHasta?: string;
}) {
  return (
    <>
      <Campo etiqueta={etiquetaDesde}>
        {({ id }) => (
          <Entrada
            id={id}
            type="date"
            className="w-40"
            value={desde}
            // El "desde" no puede ser posterior al "hasta": el navegador lo
            // impide en el propio calendario, antes de que se pida nada.
            max={hasta || undefined}
            onChange={(e) => onDesde(e.target.value)}
          />
        )}
      </Campo>
      <Campo etiqueta={etiquetaHasta}>
        {({ id }) => (
          <Entrada
            id={id}
            type="date"
            className="w-40"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => onHasta(e.target.value)}
          />
        )}
      </Campo>
    </>
  );
}

/** Un desplegable de filtro, con su opción "todos". */
export function FiltroSelector<T extends string>({
  etiqueta,
  valor,
  opciones,
  textoTodos = "Todos",
  onCambio,
}: {
  etiqueta: string;
  valor: T | "";
  opciones: readonly { id: T; etiqueta: string }[];
  textoTodos?: string;
  onCambio: (valor: T | "") => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      {({ id }) => (
        <Selector
          id={id}
          className="w-44"
          value={valor}
          onChange={(e) => onCambio(e.target.value as T | "")}
        >
          <option value="">{textoTodos}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </Selector>
      )}
    </Campo>
  );
}

/** Barra de filtros: los alinea y ofrece limpiar todo cuando hay alguno puesto. */
export function BarraFiltros({
  children,
  hayFiltros,
  onLimpiar,
  resumen,
}: {
  children: ReactNode;
  hayFiltros: boolean;
  onLimpiar: () => void;
  resumen?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      {hayFiltros && (
        <Boton variante="fantasma" tamano="sm" onClick={onLimpiar}>
          <X className="size-4" aria-hidden="true" />
          Limpiar filtros
        </Boton>
      )}
      {resumen && <div className="ml-auto self-center">{resumen}</div>}
    </div>
  );
}

/**
 * Encabezado de columna que ordena.
 *
 * `aria-sort` es lo que hace que un lector de pantalla anuncie por qué columna
 * está ordenada la tabla; sin eso la flecha no significa nada para quien no la
 * ve.
 */
export function EncabezadoOrdenable({
  etiqueta,
  campo,
  ordenActual,
  direccion,
  onOrdenar,
  alineado = "izquierda",
}: {
  etiqueta: string;
  campo: string;
  ordenActual: string;
  direccion: Direccion;
  onOrdenar: (campo: string, direccion: Direccion) => void;
  alineado?: "izquierda" | "derecha";
}) {
  const activo = ordenActual === campo;
  const Icono = activo ? (direccion === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <button
      type="button"
      // Al cambiar de columna se arranca ascendente; sobre la misma, alterna.
      onClick={() => onOrdenar(campo, activo && direccion === "asc" ? "desc" : "asc")}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground",
        activo ? "text-foreground" : "text-muted-foreground",
        alineado === "derecha" && "flex-row-reverse",
      )}
    >
      {etiqueta}
      <Icono
        className={cn("size-3.5 shrink-0", activo ? "opacity-100" : "opacity-40")}
        aria-hidden="true"
      />
    </button>
  );
}

/** El valor de `aria-sort` que va en el `<th>`. */
export function ariaSort(
  campo: string,
  ordenActual: string,
  direccion: Direccion,
): "ascending" | "descending" | undefined {
  if (campo !== ordenActual) {
    return undefined;
  }
  return direccion === "asc" ? "ascending" : "descending";
}
