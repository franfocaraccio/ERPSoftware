import { type Moneda, Money } from "../money/index.js";
import { imputarFIFO } from "./imputacion.js";

const MS_POR_DIA = 86_400_000;

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA,
  );
}

export interface ComprobanteCuenta {
  id: string;
  vencimiento: string;
  total: Money;
}

export interface SaldoComprobante {
  id: string;
  vencimiento: string;
  total: Money;
  /** Lo cobrado o pagado de este comprobante, imputado o aplicado por FIFO. */
  cancelado: Money;
  pendiente: Money;
}

/**
 * El saldo de cada comprobante de una contraparte.
 *
 * Primero se descuenta lo imputado explícitamente a cada comprobante: si quien
 * pagó dijo qué pagaba, eso manda. Después, el crédito que no tiene imputación
 * —un pago a cuenta, una nota de crédito, un cobro viejo cargado antes de que
 * existieran las imputaciones— se aplica FIFO sobre lo que quedó, cancelando
 * primero lo que vence antes. Lo que sobra sigue a cuenta.
 */
export function saldosPorComprobante(
  comprobantes: readonly ComprobanteCuenta[],
  imputado: ReadonlyMap<string, Money>,
  creditoLibre: Money,
): { comprobantes: SaldoComprobante[]; aCuenta: Money } {
  const moneda = creditoLibre.moneda;
  const tras = comprobantes.map((c) => {
    const explicito = imputado.get(c.id) ?? Money.cero(moneda);
    if (explicito.mayorQue(c.total)) {
      throw new Error(`saldosPorComprobante: ${c.id} tiene imputado más que su total`);
    }
    return { ...c, restante: c.total.restar(explicito) };
  });

  const fifo = imputarFIFO(
    tras.map((c) => ({ id: c.id, vencimiento: c.vencimiento, importe: c.restante })),
    creditoLibre,
  );
  const pendientes = new Map(fifo.pendientes.map((p) => [p.id, p.pendiente]));

  return {
    comprobantes: tras.map((c) => {
      const pendiente = pendientes.get(c.id) ?? Money.cero(moneda);
      return {
        id: c.id,
        vencimiento: c.vencimiento,
        total: c.total,
        cancelado: c.total.restar(pendiente),
        pendiente,
      };
    }),
    aCuenta: fifo.aCuenta,
  };
}

export type EstadoCobro = "pendiente" | "parcial" | "cobrada" | "vencida";

/**
 * Estado de cobro (o de pago, para compras) de un comprobante.
 *
 * Vencida gana sobre parcial: lo que importa de una factura cobrada a medias
 * cuyo plazo pasó es que está vencida.
 */
export function estadoCobro(
  total: Money,
  pendiente: Money,
  vencimiento: string,
  hoy: string,
): EstadoCobro {
  if (!pendiente.esPositivo()) {
    return "cobrada";
  }
  if (hoy > vencimiento) {
    return "vencida";
  }
  return pendiente.menorQue(total) ? "parcial" : "pendiente";
}

export interface Antiguedad {
  aVencer: Money;
  hasta30: Money;
  de31a60: Money;
  de61a90: Money;
  masDe90: Money;
}

/** La deuda pendiente repartida por días de atraso. Lo que vence hoy, a vencer. */
export function antiguedadDeuda(
  pendientes: readonly { vencimiento: string; pendiente: Money }[],
  hoy: string,
  moneda: Moneda = "ARS",
): Antiguedad {
  const r: Antiguedad = {
    aVencer: Money.cero(moneda),
    hasta30: Money.cero(moneda),
    de31a60: Money.cero(moneda),
    de61a90: Money.cero(moneda),
    masDe90: Money.cero(moneda),
  };
  for (const p of pendientes) {
    const atraso = diasEntre(p.vencimiento, hoy);
    const tramo: keyof Antiguedad =
      atraso <= 0
        ? "aVencer"
        : atraso <= 30
          ? "hasta30"
          : atraso <= 60
            ? "de31a60"
            : atraso <= 90
              ? "de61a90"
              : "masDe90";
    r[tramo] = r[tramo].sumar(p.pendiente);
  }
  return r;
}

/**
 * Un cliente está en mora si tiene algo impago vencido hace más días que el
 * umbral de la empresa (`umbral_mora_dias` de Parámetros).
 */
export function enMora(
  pendientes: readonly { vencimiento: string; pendiente: Money }[],
  hoy: string,
  umbralDias: number,
): boolean {
  return pendientes.some(
    (p) => p.pendiente.esPositivo() && diasEntre(p.vencimiento, hoy) > umbralDias,
  );
}
