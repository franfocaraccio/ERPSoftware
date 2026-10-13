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
 * Días de rotación de stock = 30 / (salidas del período / stock).
 * Las dos cifras tienen que estar en la misma medida: el panel usa el costo
 * de lo vendido y el stock valuado al costo, que suman productos distintos.
 * Se reciben como decimales, sin moneda: el resultado son días.
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
 * Qué porcentaje del total representa un importe.
 *
 * Devuelve null cuando no hay total contra el cual comparar: "no hay nada por
 * cobrar" y "este cliente no pesa nada" son cosas distintas y la UI las
 * muestra distinto.
 */
export function participacion(importe: Money, total: Money): string | null {
  const ratio = dividir(importe, total, 6);
  return ratio === null
    ? null
    : new Decimal(ratio).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export interface Concentracion {
  clave: string;
  porcentaje: string;
}

/**
 * Concentración de riesgo: qué porcentaje del total se lleva la clave más
 * grande. Sirve para cheques (por librador), clientes (por cuánto nos deben) y
 * proveedores (por cuánto les debemos): el riesgo es el mismo, que una sola
 * contraparte pese demasiado.
 *
 * Los importes de una misma clave se acumulan antes de comparar — tres
 * comprobantes del mismo cliente son un solo riesgo, no tres chicos.
 *
 * Los saldos a favor quedan afuera: no son plata por cobrar, y restarlos del
 * total haría que los demás parezcan concentrar más de lo que concentran.
 */
export function concentracionMaxima(
  items: readonly { clave: string; importe: Money }[],
): Concentracion | null {
  const moneda = items[0]?.importe.moneda ?? "ARS";
  const porClave = new Map<string, Money>();
  for (const item of items) {
    const acumulado = porClave.get(item.clave) ?? Money.cero(moneda);
    porClave.set(item.clave, acumulado.sumar(item.importe));
  }

  const deudores = [...porClave.entries()].filter(([, importe]) => importe.esPositivo());
  if (deudores.length === 0) {
    return null;
  }

  const total = Money.sumarTodos(
    deudores.map(([, importe]) => importe),
    moneda,
  );

  let mayor: { clave: string; importe: Money } | null = null;
  for (const [clave, importe] of deudores) {
    if (!mayor || importe.mayorQue(mayor.importe)) {
      mayor = { clave, importe };
    }
  }
  if (!mayor) {
    return null;
  }

  const porcentaje = participacion(mayor.importe, total);
  return porcentaje === null ? null : { clave: mayor.clave, porcentaje };
}

/**
 * Concentración de la cartera de cheques por librador. Es `concentracionMaxima`
 * con el nombre que usa el dominio de tesorería.
 */
export function concentracionLibrador(
  cheques: readonly { librador: string; importe: Money }[],
): { librador: string; porcentaje: string } | null {
  const maxima = concentracionMaxima(
    cheques.map((cheque) => ({ clave: cheque.librador, importe: cheque.importe })),
  );
  return maxima === null ? null : { librador: maxima.clave, porcentaje: maxima.porcentaje };
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
