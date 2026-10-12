import { useCallback, useState } from "react";

/**
 * Qué columnas esconde cada persona en cada tabla.
 *
 * Se guardan las **escondidas**, no las visibles, y no es un detalle: una
 * columna nueva aparece por defecto para todo el mundo, incluso para quien ya
 * tenía una preferencia guardada. Al revés —guardando las visibles— una columna
 * agregada después quedaría oculta en silencio para los usuarios viejos, que es
 * el error que nadie reporta porque nadie sabe que se lo está perdiendo.
 *
 * Es el mismo criterio que el `meta.secundaria` de `lib/tabla.ts`.
 */
export type Escondidas = readonly string[];

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
  return `erp.columnas.${tabla}`;
}

/**
 * Las columnas escondidas de una tabla.
 *
 * Todo acceso al almacenamiento va en try/catch: en una ventana privada, con
 * las cookies bloqueadas o con la cuota llena, leer y escribir tiran. Una
 * preferencia de visualización nunca puede tumbar la pantalla.
 */
export function leerEscondidas(tabla: string, almacen = almacenDelNavegador()): Escondidas {
  try {
    const guardado = almacen?.getItem(clave(tabla));
    if (!guardado) {
      return [];
    }
    const datos: unknown = JSON.parse(guardado);
    // Si el contenido no es lo que esperamos, se muestran todas: de más es
    // recuperable mirando, de menos es invisible.
    return Array.isArray(datos) && datos.every((x) => typeof x === "string") ? datos : [];
  } catch {
    return [];
  }
}

/** Guarda la elección. Si no se puede, vale para esta sesión y listo. */
export function guardarEscondidas(
  tabla: string,
  escondidas: Escondidas,
  almacen = almacenDelNavegador(),
): void {
  try {
    almacen?.setItem(clave(tabla), JSON.stringify([...escondidas]));
  } catch {
    // Sin almacenamiento la elección no sobrevive al refresh, y es aceptable.
  }
}

/**
 * Lo que espera TanStack: un mapa de columna a visible. Solo necesita las
 * escondidas, porque lo que no está en el mapa se considera visible.
 */
export function aVisibilidad(escondidas: Escondidas): Record<string, boolean> {
  return Object.fromEntries(escondidas.map((id) => [id, false]));
}

/**
 * Las columnas escondidas de una tabla, recordadas en el navegador de cada uno.
 *
 * Es por tabla y por persona: el pedido original era "que cada uno lo ajuste".
 */
export function useColumnasEscondidas(
  tabla: string,
): [Escondidas, (siguiente: Escondidas) => void] {
  const [escondidas, setEnMemoria] = useState<Escondidas>(() => leerEscondidas(tabla));

  const setEscondidas = useCallback(
    (siguiente: Escondidas) => {
      setEnMemoria(siguiente);
      guardarEscondidas(tabla, siguiente);
    },
    [tabla],
  );

  return [escondidas, setEscondidas];
}
