import type { Money } from "../money/index.js";

/**
 * Saldo de cuenta corriente de una contraparte (cliente o proveedor).
 *
 * Positivo = nos deben (cliente) o debemos (proveedor).
 * Negativo = hay saldo a favor de la contraparte.
 *
 * Las sumas de comprobantes y de pagos las hace la query; acá vive la resta,
 * que es la regla de negocio.
 */
export function saldoCuentaCorriente(totalComprobantes: Money, totalPagado: Money): Money {
  return totalComprobantes.restar(totalPagado);
}
