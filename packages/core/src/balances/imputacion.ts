import { Money } from "../money/index.js";

export interface Deuda {
  id: string;
  /** Fecha de vencimiento, ISO `YYYY-MM-DD`. */
  vencimiento: string;
  importe: Money;
}

export interface Pendiente {
  id: string;
  vencimiento: string;
  pendiente: Money;
}

export interface ResultadoImputacion {
  /** Lo que queda por cobrar o pagar de cada comprobante, en orden de vencimiento. */
  pendientes: Pendiente[];
  /** Crédito que sobró después de cancelar todo: un pago a cuenta. */
  aCuenta: Money;
}

/**
 * Aplica un crédito (lo cobrado o pagado a una contraparte) contra sus
 * comprobantes, cancelando primero el que vence antes.
 *
 * Es la regla que se usa cuando un pago no dice qué comprobante cancela. FIFO
 * es lo que espera cualquiera que mire una cuenta corriente: el que paga sin
 * aclarar, paga lo más viejo.
 *
 * Las notas de crédito no son deudas negativas: se suman al crédito antes de
 * llamar a esta función. Mezclar signos en la lista dejaría que una nota de
 * crédito "cancele" sólo los comprobantes que vencen después de ella.
 */
export function imputarFIFO(deudas: readonly Deuda[], credito: Money): ResultadoImputacion {
  if (credito.esNegativo()) {
    throw new Error("imputarFIFO: el crédito no puede ser negativo");
  }
  for (const d of deudas) {
    if (d.importe.esNegativo()) {
      throw new Error(`imputarFIFO: la deuda ${d.id} es negativa; pasala como crédito`);
    }
  }

  const ordenadas = [...deudas].sort((a, b) =>
    a.vencimiento === b.vencimiento
      ? a.id.localeCompare(b.id)
      : a.vencimiento.localeCompare(b.vencimiento),
  );

  let disponible = credito;
  const pendientes: Pendiente[] = [];
  for (const d of ordenadas) {
    if (!disponible.menorQue(d.importe)) {
      disponible = disponible.restar(d.importe);
      continue;
    }
    pendientes.push({
      id: d.id,
      vencimiento: d.vencimiento,
      pendiente: d.importe.restar(disponible),
    });
    disponible = Money.cero(credito.moneda);
  }

  return { pendientes, aCuenta: disponible };
}
