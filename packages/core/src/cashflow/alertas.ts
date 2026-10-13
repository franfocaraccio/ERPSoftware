import type { Money } from "../money/index.js";

interface SemanaConSaldo {
  semana: number;
  inicio: string;
  saldoFinal: Money;
}

export interface AlertasCaja<S extends SemanaConSaldo = SemanaConSaldo> {
  /** La primera semana que termina bajo el mínimo operativo. */
  primeraBajoMinimo: S | null;
  /** La primera semana que termina en negativo. */
  primeraNegativa: S | null;
}

/**
 * Lo que hay que saber antes de que pase: en qué semana la caja proyectada
 * queda bajo el mínimo operativo y en cuál se queda sin plata. Es aritmética,
 * no una opinión: no necesita un modelo de lenguaje.
 */
export function alertasAnticipadas<S extends SemanaConSaldo>(
  semanas: readonly S[],
  minimoOperativo: Money | null,
): AlertasCaja<S> {
  return {
    primeraBajoMinimo: minimoOperativo
      ? (semanas.find((s) => s.saldoFinal.menorQue(minimoOperativo)) ?? null)
      : null,
    primeraNegativa: semanas.find((s) => s.saldoFinal.esNegativo()) ?? null,
  };
}
