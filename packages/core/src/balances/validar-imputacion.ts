import { Money } from "../money/index.js";

export interface LineaImputacion {
  id: string;
  importe: Money;
  /** Lo que le queda al comprobante sin contar este movimiento. */
  disponible: Money;
}

/**
 * Las reglas de una imputación: el motivo por el que no vale, o null.
 *
 * - Cada línea mayor a cero, y un comprobante una sola vez.
 * - No más de lo que le queda a cada comprobante.
 * - Entre todas, no más que el importe del movimiento. Lo que sobra queda a
 *   cuenta, que está permitido (decisión de Fran del 12/10/2026).
 */
export function validarImputaciones(
  importeMovimiento: Money,
  lineas: readonly LineaImputacion[],
): string | null {
  const vistos = new Set<string>();
  for (const l of lineas) {
    if (!l.importe.esPositivo()) {
      return "Cada importe imputado tiene que ser mayor a cero.";
    }
    if (vistos.has(l.id)) {
      return "Un comprobante no se puede imputar dos veces en el mismo movimiento.";
    }
    vistos.add(l.id);
    if (l.importe.mayorQue(l.disponible)) {
      return `Se imputa más de lo que le queda al comprobante (${l.disponible.aStringFiscal()}).`;
    }
  }

  const total = Money.sumarTodos(
    lineas.map((l) => l.importe),
    importeMovimiento.moneda,
  );
  if (total.mayorQue(importeMovimiento)) {
    return "Se imputa más de lo que dice el movimiento.";
  }
  return null;
}
