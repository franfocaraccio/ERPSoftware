import { Decimal } from "decimal.js";
import { Money } from "../money/index.js";

export type EstadoStock = "ok" | "reponer";

/**
 * Semáforo de reposición (sección 4 de la especificación):
 * stock actual <= stock mínimo → 'Reponer'.
 * Las cantidades no son dinero: se comparan como decimales sin moneda.
 */
export function estadoStock(stockActual: string, stockMinimo: string): EstadoStock {
  return new Decimal(stockActual).lessThanOrEqualTo(new Decimal(stockMinimo)) ? "reponer" : "ok";
}

/** Capital inmovilizado en un producto: stock actual × costo unitario. */
export function valorizacion(stockActual: string, costoUnitario: Money | null): Money {
  if (!costoUnitario) {
    return Money.cero("ARS");
  }
  return costoUnitario.multiplicarPor(stockActual).redondeoFiscal();
}

/**
 * Margen bruto porcentual de un producto: (precio − costo) / precio.
 * Devuelve el porcentaje como string con 2 decimales, o null si no se puede
 * calcular (falta un dato o el precio es cero).
 */
export function margenBruto(precioVenta: Money | null, costoUnitario: Money | null): string | null {
  if (!precioVenta || !costoUnitario || precioVenta.esCero()) {
    return null;
  }
  const ganancia = new Decimal(precioVenta.restar(costoUnitario).aString());
  const precio = new Decimal(precioVenta.aString());
  return ganancia.dividedBy(precio).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
