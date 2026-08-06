import { Decimal } from "decimal.js";
import { Money } from "../money/index.js";

/**
 * KPIs de la sección 8.1. Todos devuelven null cuando no se pueden calcular
 * (falta el denominador), en vez de cero: "no hay datos" y "el valor es cero"
 * significan cosas distintas y el semáforo los trata distinto.
 */

export type Semaforo = "ok" | "alerta" | "sin_datos";

export interface Umbral {
  umbral: number;
  /** Si superar el umbral es bueno o malo. */
  direccion: "mayor_es_mejor" | "menor_es_mejor";
}

/** Días del período de referencia que usa la especificación. */
export const DIAS_PERIODO = 30;

function dividir(numerador: Money, denominador: Money, decimales: number): string | null {
  if (denominador.esCero()) {
    return null;
  }
  return new Decimal(numerador.aString())
    .dividedBy(new Decimal(denominador.aString()))
    .toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP)
    .toFixed(decimales);
}

/**
 * Liquidez corriente = (saldo de tesorería + por cobrar a 30 días) / a pagar a
 * 30 días. Alerta por debajo de 1: no alcanza para cubrir lo que vence.
 */
export function liquidezCorriente(
  saldoTesoreria: Money,
  porCobrar30d: Money,
  aPagar30d: Money,
): string | null {
  return dividir(saldoTesoreria.sumar(porCobrar30d), aPagar30d, 2);
}

/**
 * Un saldo negativo significa que la contraparte pagó de más: no hay nada
 * pendiente, así que en días es cero. Sin esto el KPI daría días negativos,
 * que no quieren decir nada.
 */
function pendiente(saldo: Money): Money {
  return saldo.esNegativo() ? Money.cero(saldo.moneda) : saldo;
}

/** DSO: días promedio que tarda en cobrarse una venta. */
export function dso(saldoCuentaCorriente: Money, ventasPeriodo: Money): number | null {
  const ratio = dividir(pendiente(saldoCuentaCorriente), ventasPeriodo, 6);
  return ratio === null ? null : Math.round(Number(ratio) * DIAS_PERIODO);
}

/** DPO: días promedio que tardamos en pagarle a proveedores. */
export function dpo(saldoAPagar: Money, comprasPeriodo: Money): number | null {
  const ratio = dividir(pendiente(saldoAPagar), comprasPeriodo, 6);
  return ratio === null ? null : Math.round(Number(ratio) * DIAS_PERIODO);
}

/**
 * Días de rotación de stock = 30 / (salidas del período / stock promedio).
 * Cantidades, no dinero: se comparan como decimales sin moneda.
 */
export function diasRotacionStock(salidasPeriodo: string, stockPromedio: string): number | null {
  const salidas = new Decimal(salidasPeriodo);
  const promedio = new Decimal(stockPromedio);
  if (salidas.isZero() || promedio.isZero()) {
    return null;
  }
  return Math.round(new Decimal(DIAS_PERIODO).dividedBy(salidas.dividedBy(promedio)).toNumber());
}

/**
 * Ciclo de conversión de efectivo = DSO + días de rotación − DPO.
 * Cuántos días pasa la plata inmovilizada entre que se compra y se cobra.
 */
export function cicloConversionEfectivo(
  diasCobro: number | null,
  diasRotacion: number | null,
  diasPago: number | null,
): number | null {
  if (diasCobro === null || diasRotacion === null || diasPago === null) {
    return null;
  }
  return diasCobro + diasRotacion - diasPago;
}

/** Margen bruto porcentual = (ventas − costo de ventas) / ventas. */
export function margenBrutoPorcentual(ventas: Money, costoVentas: Money): string | null {
  if (ventas.esCero()) {
    return null;
  }
  const ratio = dividir(ventas.restar(costoVentas), ventas, 4);
  return ratio === null
    ? null
    : new Decimal(ratio).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Concentración de riesgo en cheques: qué porcentaje de la cartera corresponde
 * al librador más grande. Un solo librador concentrando mucho es riesgo.
 */
export function concentracionLibrador(
  cheques: readonly { librador: string; importe: Money }[],
): { librador: string; porcentaje: string } | null {
  if (cheques.length === 0) {
    return null;
  }
  const moneda = cheques[0]?.importe.moneda ?? "ARS";
  const porLibrador = new Map<string, Money>();
  for (const cheque of cheques) {
    const acumulado = porLibrador.get(cheque.librador) ?? Money.cero(moneda);
    porLibrador.set(cheque.librador, acumulado.sumar(cheque.importe));
  }

  const total = Money.sumarTodos([...porLibrador.values()], moneda);
  if (total.esCero()) {
    return null;
  }

  let mayor: { librador: string; importe: Money } | null = null;
  for (const [librador, importe] of porLibrador) {
    if (!mayor || importe.mayorQue(mayor.importe)) {
      mayor = { librador, importe };
    }
  }
  if (!mayor) {
    return null;
  }

  const ratio = dividir(mayor.importe, total, 4);
  return {
    librador: mayor.librador,
    porcentaje:
      ratio === null
        ? "0.00"
        : new Decimal(ratio).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
  };
}

/** Estar exactamente en el umbral todavía se considera aceptable. */
export function semaforoDe(valor: number | null, umbral: Umbral): Semaforo {
  if (valor === null) {
    return "sin_datos";
  }
  const dentro =
    umbral.direccion === "mayor_es_mejor" ? valor >= umbral.umbral : valor <= umbral.umbral;
  return dentro ? "ok" : "alerta";
}
