import { useCallback, useState } from "react";

export const DENSIDADES = ["comoda", "compacta"] as const;
export type Densidad = (typeof DENSIDADES)[number];

export const ETIQUETA_DENSIDAD: Record<Densidad, string> = {
  comoda: "Cómoda",
  compacta: "Compacta",
};

/**
 * Clases de padding por densidad.
 *
 * El texto NO cambia de tamaño: se queda en 14px en los dos modos. Lo único que
 * se mueve es el aire alrededor, y ahí está toda la diferencia con bajar el
 * zoom del navegador, que encoge la letra por debajo del mínimo legible y los
 * botones por debajo del tamaño táctil.
 *
 * El padding horizontal también baja, y no es un detalle: `px-4` son 32px por
 * columna, así que en una tabla de nueve el modo compacto recupera casi 150px
 * de ancho. Ese es el problema que vino a resolver —que la información no entre
 * a lo ancho—; ver más filas es el beneficio secundario.
 */
const CELDA: Record<Densidad, string> = {
  comoda: "px-4 py-3",
  compacta: "px-2 py-1.5",
};

/**
 * Los encabezados además pueden partirse en dos líneas en modo compacto.
 *
 * En varias tablas el título es más ancho que el dato que encabeza —"PRÓX.
 * VENCIMIENTO" sobre una fecha, "Límite de crédito" sobre un importe— así que
 * es el texto del `th` el que fija el ancho de la columna. Dejarlo envolver
 * cuesta una fila de encabezado un poco más alta, una sola vez, y devuelve
 * ancho en todas las filas.
 */
const ENCABEZADO: Record<Densidad, string> = {
  comoda: "px-4 py-2.5 whitespace-nowrap",
  compacta: "px-2 py-1.5",
};

export function clasesCelda(densidad: Densidad): string {
  return CELDA[densidad];
}

export function clasesEncabezado(densidad: Densidad): string {
  return ENCABEZADO[densidad];
}

export const DENSIDAD_POR_DEFECTO: Densidad = "comoda";

/** Lo mínimo que esto necesita de `localStorage`, para poder darle otro en los tests. */
export type Almacen = Pick<Storage, "getItem" | "setItem">;

function almacenDelNavegador(): Almacen | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Acceder a localStorage tira si el sitio tiene el almacenamiento
    // bloqueado, antes incluso de leer nada.
    return null;
  }
}

function clave(tabla: string): string {
  return `erp.densidad.${tabla}`;
}

function esDensidad(valor: string | null): valor is Densidad {
  return valor !== null && (DENSIDADES as readonly string[]).includes(valor);
}

/**
 * La densidad guardada para una tabla, o la cómoda si no hay ninguna.
 *
 * Todo acceso al almacenamiento va en try/catch: en una ventana privada, con
 * las cookies bloqueadas o con la cuota llena, leer y escribir tiran. Una
 * preferencia de visualización nunca puede tumbar la pantalla.
 */
export function leerDensidad(tabla: string, almacen = almacenDelNavegador()): Densidad {
  try {
    const guardada = almacen?.getItem(clave(tabla)) ?? null;
    return esDensidad(guardada) ? guardada : DENSIDAD_POR_DEFECTO;
  } catch {
    return DENSIDAD_POR_DEFECTO;
  }
}

/** Guarda la elección. Si no se puede, no pasa nada: vale para esta sesión. */
export function guardarDensidad(
  tabla: string,
  valor: Densidad,
  almacen = almacenDelNavegador(),
): void {
  try {
    almacen?.setItem(clave(tabla), valor);
  } catch {
    // Sin almacenamiento la elección no sobrevive al refresh, y es aceptable.
  }
}

/**
 * La densidad de una tabla, recordada en el navegador de cada uno.
 *
 * Es por tabla y por persona a propósito: el pedido original era "que cada uno
 * lo ajuste", y alguien puede querer stock compacto —que es la que tiene más
 * columnas— y el resto cómodo.
 */
export function useDensidad(tabla: string): [Densidad, (valor: Densidad) => void] {
  const [densidad, setDensidadEnMemoria] = useState<Densidad>(() => leerDensidad(tabla));

  const setDensidad = useCallback(
    (valor: Densidad) => {
      setDensidadEnMemoria(valor);
      guardarDensidad(tabla, valor);
    },
    [tabla],
  );

  return [densidad, setDensidad];
}
