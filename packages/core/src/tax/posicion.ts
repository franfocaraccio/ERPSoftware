import { Money } from "../money/index.js";
import { importeDeterminado } from "./impuestos.js";

export interface MesImpositivo {
  /** `YYYY-MM`. */
  periodo: string;
  /** Lo que genera el impuesto: el débito fiscal del IVA, el IIBB del mes. */
  cargo: Money;
  /** Lo que lo reduce: el crédito fiscal, las retenciones y percepciones. */
  credito: Money;
}

export interface PosicionMes extends MesImpositivo {
  saldoAFavorAnterior: Money;
  aPagar: Money;
  saldoAFavorSiguiente: Money;
}

/**
 * La posición de un impuesto mes a mes: cargo menos crédito menos el saldo a
 * favor que venía del mes anterior. Si el crédito supera al cargo no se paga
 * nada y la diferencia pasa como saldo a favor al mes siguiente.
 *
 * Es el mecanismo del IVA (débito fiscal − crédito fiscal) y sirve igual para
 * IIBB (impuesto del mes − retenciones y percepciones sufridas).
 */
export function posicionMensual(
  meses: readonly MesImpositivo[],
  saldoAFavorInicial: Money = Money.cero("ARS"),
): PosicionMes[] {
  const ordenados = [...meses].sort((a, b) => a.periodo.localeCompare(b.periodo));
  let arrastre = saldoAFavorInicial;
  return ordenados.map((m) => {
    const neto = m.cargo.restar(m.credito).restar(arrastre);
    const aPagar = neto.esPositivo() ? neto : Money.cero(m.cargo.moneda);
    const siguiente = neto.esNegativo() ? neto.negar() : Money.cero(m.cargo.moneda);
    const fila = {
      ...m,
      saldoAFavorAnterior: arrastre,
      aPagar,
      saldoAFavorSiguiente: siguiente,
    };
    arrastre = siguiente;
    return fila;
  });
}

/**
 * Lo determinado de una obligación cargada a mano: un importe fijo (una cuota
 * de monotributo, un anticipo de Ganancias que informa ARCA) o, si no hay,
 * base por alícuota.
 */
export function determinadoImpuesto(o: {
  importeFijo: Money | null;
  base: Money | null;
  alicuota: string | null;
}): Money {
  if (o.importeFijo) {
    return o.importeFijo;
  }
  if (o.base && o.alicuota !== null) {
    return importeDeterminado(o.base, o.alicuota);
  }
  return Money.cero("ARS");
}
