import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";

/**
 * Alineación declarada en la definición de la columna.
 *
 * Las columnas numéricas van a la derecha, y el encabezado tiene que
 * acompañarlas. Antes cada `header` traía su propio `text-right`, pero desde
 * que las columnas ordenables se pintan con `EncabezadoOrdenable` —que arma su
 * propio contenido y no usa el `header` de la definición— ese `text-right`
 * dejaba de aplicarse y el título quedaba a la izquierda de su propia columna.
 *
 * Con la alineación en `meta` la declara la columna una sola vez, y la leen
 * tanto el `<th>` como el botón de ordenamiento.
 */
// La firma tiene que ser idéntica a la de table-core v9, anotaciones de
// varianza incluidas, o TypeScript rechaza la extensión.
declare module "@tanstack/react-table" {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    alineado?: "derecha";
    /**
     * Columnas que se esconden en pantalla chica. En un teléfono no entran
     * siete columnas: la tabla envuelve el texto Y scrollea, que es lo peor de
     * los dos mundos. El dato no se pierde, se ve al abrir el registro.
     *
     * Se marca lo secundario y no lo principal a propósito: una columna nueva
     * aparece por defecto, que es el error visible, en vez de desaparecer en
     * silencio del teléfono.
     */
    secundaria?: boolean;
    /**
     * Columnas de texto libre, que se recortan con puntos suspensivos en vez de
     * empujar el ancho de la tabla.
     *
     * Sin esto, una sola descripción larga desplaza a las columnas de la
     * derecha fuera de la pantalla, en cualquier densidad: las celdas son
     * `whitespace-nowrap` y la columna crece hasta donde haga falta. El texto
     * completo queda en el `title`, y la fila se abre para verlo entero.
     */
    ancha?: boolean;
  }
}

/** Clases para esconder una columna secundaria abajo del breakpoint `sm`. */
export function clasesColumna(meta: { secundaria?: boolean; ancha?: boolean } | undefined): string {
  const clases: string[] = [];
  if (meta?.secundaria) {
    clases.push("hidden sm:table-cell");
  }
  if (meta?.ancha) {
    clases.push("max-w-[22rem] truncate");
  }
  return clases.join(" ");
}

// Recibe el `meta` y no el header entero: los genéricos de Header no unifican
// entre tablas de distintas filas y obligarían a un `any` en cada llamada.
export function alineadoDerecha(meta: { alineado?: "derecha" } | undefined): boolean {
  return meta?.alineado === "derecha";
}
