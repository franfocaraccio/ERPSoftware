import { Decimal } from "decimal.js";
import type { Money } from "../money/index.js";

export interface Variacion {
  diferencia: Money;
  /** Null si el anterior es cero: no hay contra qué. */
  porcentaje: string | null;
}

/**
 * Cuánto cambió un importe contra el período anterior. El porcentaje se mide
 * sobre el valor absoluto del anterior, para que pasar de una pérdida a una
 * ganancia se lea como una mejora y no como una caída.
 */
export function variacion(actual: Money, anterior: Money): Variacion {
  const diferencia = actual.restar(anterior);
  if (anterior.esCero()) {
    return { diferencia, porcentaje: null };
  }
  const base = new Decimal(anterior.aString()).abs();
  return {
    diferencia,
    porcentaje: new Decimal(diferencia.aString())
      .dividedBy(base)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
  };
}
