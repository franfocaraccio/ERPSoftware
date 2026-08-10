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
  }
}

// Recibe el `meta` y no el header entero: los genéricos de Header no unifican
// entre tablas de distintas filas y obligarían a un `any` en cada llamada.
export function alineadoDerecha(meta: { alineado?: "derecha" } | undefined): boolean {
  return meta?.alineado === "derecha";
}
