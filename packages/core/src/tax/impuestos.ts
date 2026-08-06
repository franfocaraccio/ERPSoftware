import { Money } from "../money/index.js";

export type EstadoImpuesto = "pagado" | "vencido" | "pendiente";

/** Importe determinado = base imponible × alícuota (sección 6). */
export function importeDeterminado(baseImponible: Money, alicuota: string): Money {
  return baseImponible.porcentaje(alicuota).redondeoFiscal();
}

/**
 * Estado de una obligación fiscal. Se calcula al leer, nunca se persiste:
 * depende de la fecha actual y quedaría desactualizado.
 *
 * Las fechas van como ISO (YYYY-MM-DD) y se comparan como strings, que en ese
 * formato ordena igual que cronológicamente — así no interviene el huso horario.
 * El día del vencimiento todavía cuenta como pendiente.
 */
export function estadoImpuesto(
  determinado: Money,
  pagado: Money,
  fechaVencimiento: string,
  hoy: string,
): EstadoImpuesto {
  if (!pagado.menorQue(determinado)) {
    return "pagado";
  }
  return hoy > fechaVencimiento ? "vencido" : "pendiente";
}

/** Lo que falta pagar. Nunca negativo: un pago en exceso deja saldo cero. */
export function saldoImpuesto(determinado: Money, pagado: Money): Money {
  const saldo = determinado.restar(pagado);
  return saldo.esNegativo() ? Money.cero(determinado.moneda) : saldo;
}
