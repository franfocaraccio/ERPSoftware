import { Decimal } from "decimal.js";
import type { Money } from "../money/index.js";

export interface DatosReposicion {
  stock: string;
  minimo: string;
  /** Lo que salió por ventas en los últimos 30 días, neto de devoluciones. */
  salidas30Dias: string;
}

export interface SugerenciaCompra {
  cantidad: string;
  /** Cantidad × costo de reposición; null si no hay costo con qué valuarla. */
  importe: Money | null;
}

/**
 * Cuánto comprar de un producto marcado "Reponer".
 *
 * El objetivo es volver al mínimo y cubrir un mes más de ventas: mínimo +
 * salidas de los últimos 30 días. Sin ventas en el mes no hay consumo con qué
 * estimar, y se repone hasta el doble del mínimo. Es una sugerencia para
 * armar el pedido, no una orden: la persona ajusta según el proveedor.
 *
 * Devuelve null si el producto no está para reponer o no tiene mínimo.
 */
export function sugerenciaCompra(
  datos: DatosReposicion,
  costoReposicion: Money | null,
): SugerenciaCompra | null {
  const stock = new Decimal(datos.stock);
  const minimo = new Decimal(datos.minimo);
  if (minimo.lessThanOrEqualTo(0) || stock.greaterThan(minimo)) {
    return null;
  }
  const salidas = Decimal.max(new Decimal(datos.salidas30Dias), 0);
  const objetivo = minimo.plus(salidas.isZero() ? minimo : salidas);
  const cantidad = objetivo.minus(stock).toDecimalPlaces(3, Decimal.ROUND_UP);
  if (cantidad.lessThanOrEqualTo(0)) {
    return null;
  }
  return {
    cantidad: cantidad.toString(),
    importe: costoReposicion
      ? costoReposicion.multiplicarPor(cantidad.toString()).redondeoFiscal()
      : null,
  };
}
