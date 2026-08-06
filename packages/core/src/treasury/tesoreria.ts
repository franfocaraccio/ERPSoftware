import type { Money } from "../money/index.js";

export type TipoMovimiento = "ingreso" | "egreso";

/**
 * El importe se guarda siempre positivo; el signo lo da el tipo.
 * Esta función es la única fuente de esa convención.
 */
export function signoMovimiento(tipo: TipoMovimiento, importe: Money): Money {
  return tipo === "egreso" ? importe.negar() : importe;
}

/** Saldo de una cuenta = suma de ingresos − suma de egresos. Derivado, no se persiste. */
export function saldoCuenta(totalIngresos: Money, totalEgresos: Money): Money {
  return totalIngresos.restar(totalEgresos);
}

const MS_POR_DIA = 86_400_000;

/**
 * Días que faltan para que un cheque sea cobrable (sección 5.3).
 * Negativo si la fecha ya pasó. Las fechas van en ISO (YYYY-MM-DD) y se
 * interpretan en UTC para que el huso horario no corra el resultado un día.
 */
export function diasParaCobro(fechaPago: string, hoy: string): number {
  const pago = Date.parse(`${fechaPago}T00:00:00Z`);
  const referencia = Date.parse(`${hoy}T00:00:00Z`);
  return Math.round((pago - referencia) / MS_POR_DIA);
}
