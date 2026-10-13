import { Decimal } from "decimal.js";
import { Money } from "../money/index.js";

/**
 * El costo unitario después de una compra, por promedio ponderado (decisión
 * de Fran del 12/10/2026):
 *
 *   (stock previo × costo previo + cantidad comprada × costo de compra)
 *   / (stock previo + cantidad comprada)
 *
 * Si no había stock (o era negativo, porque se vendió lo que no se tenía), o
 * si no había costo, no hay con qué ponderar: el costo pasa a ser el de la
 * compra.
 */
export function costoPromedioPonderado(
  stockPrevio: string,
  costoPrevio: Money | null,
  cantidadComprada: string,
  costoCompra: Money,
): Money {
  const cantidad = new Decimal(cantidadComprada);
  if (cantidad.lessThanOrEqualTo(0)) {
    throw new Error("costoPromedioPonderado: la cantidad comprada tiene que ser positiva");
  }
  const previo = new Decimal(stockPrevio);
  if (!costoPrevio || previo.lessThanOrEqualTo(0)) {
    return costoCompra;
  }
  const total = previo.plus(cantidad);
  const valor = new Decimal(costoPrevio.aString())
    .times(previo)
    .plus(new Decimal(costoCompra.aString()).times(cantidad));
  return Money.desdeString(
    valor.dividedBy(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    costoCompra.moneda,
  );
}
