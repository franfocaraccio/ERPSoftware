import type { Money } from "../money/index.js";
import { discriminaIva, type LetraComprobante } from "./comprobantes.js";

/**
 * Revisión de los totales que se leyeron de un comprobante en papel.
 *
 * Esto no corrige nada: devuelve reparos para que una persona mire. Corregir
 * solo sería peor que marcar, porque cuando un total no cierra el número malo
 * puede ser cualquiera de los tres y sólo quien tiene el papel delante sabe
 * cuál.
 */

export interface TotalesLeidos {
  letra: LetraComprobante;
  neto: Money;
  iva: Money;
  /** Percepciones y demás. Cero cuando el comprobante no los trae. */
  otrosTributos?: Money;
  total: Money;
}

export type ReparoLectura =
  | { tipo: "total_no_cierra"; esperado: Money; leido: Money }
  | { tipo: "iva_sin_discriminar"; iva: Money };

/**
 * Cómo tiene que cerrar un comprobante, según su letra:
 *
 * - **A**: el IVA va discriminado y suma. `total = neto + iva + otros`.
 * - **B y C**: el IVA va **incluido** en los precios, así que `total = neto`.
 *   Una B puede mostrar abajo un "IVA contenido" por el régimen de
 *   transparencia fiscal (ley 27.743); ese número es informativo y ya está
 *   adentro del total. Cargarlo como IVA discriminado infla el comprobante.
 *
 * La regla de qué letra discrimina ya vive en `discriminaIva`; acá sólo se
 * aplica.
 */
export function revisarTotalesLeidos(totales: TotalesLeidos): ReparoLectura[] {
  const { letra, neto, iva, total } = totales;
  const otros = totales.otrosTributos ?? neto.restar(neto);
  const reparos: ReparoLectura[] = [];

  if (discriminaIva(letra)) {
    // `sumar` exige la misma moneda, así que una lectura con monedas
    // mezcladas revienta acá en vez de producir un número sin sentido.
    const esperado = neto.sumar(iva).sumar(otros);
    if (!esperado.igualA(total)) {
      reparos.push({ tipo: "total_no_cierra", esperado, leido: total });
    }
    return reparos;
  }

  if (!iva.esCero()) {
    reparos.push({ tipo: "iva_sin_discriminar", iva });
  }
  const esperado = neto.sumar(otros);
  if (!esperado.igualA(total)) {
    reparos.push({ tipo: "total_no_cierra", esperado, leido: total });
  }
  return reparos;
}
