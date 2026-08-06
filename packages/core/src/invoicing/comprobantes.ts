import { type Moneda, Money } from "../money/index.js";

export type CondicionIva = "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final";

export type LetraComprobante = "A" | "B" | "C" | "E";

export type AlicuotaIva = "0" | "2.5" | "5" | "10.5" | "21" | "27" | "exento" | "no_gravado";

export interface LineaItem {
  cantidad: string;
  precioUnitario: string;
  alicuotaIva: AlicuotaIva;
}

/** Un grupo por alícuota: es lo que WSFEv1 recibe, en lugar de los ítems. */
export interface GrupoAlicuota {
  alicuota: AlicuotaIva;
  baseImponible: Money;
  importe: Money;
}

export interface ComprobanteCalculado {
  neto: Money;
  iva: Money;
  total: Money;
  porAlicuota: GrupoAlicuota[];
}

/**
 * Letra del comprobante según la condición IVA de emisor y receptor.
 * Solo un Responsable Inscripto discrimina IVA (comprobante A hacia otro RI);
 * hacia cualquier otro receptor emite B. Monotributistas y exentos emiten C
 * siempre, sin importar quién reciba.
 */
export function letraPermitida(
  condicionEmisor: CondicionIva,
  condicionReceptor: CondicionIva,
): LetraComprobante {
  if (condicionEmisor !== "responsable_inscripto") {
    return "C";
  }
  return condicionReceptor === "responsable_inscripto" ? "A" : "B";
}

/** Solo la A muestra el IVA discriminado; en B y C va incluido en el total. */
export function discriminaIva(letra: LetraComprobante): boolean {
  return letra === "A";
}

/** Las alícuotas que no son un porcentaje no generan un grupo de IVA. */
function esPorcentaje(alicuota: AlicuotaIva): boolean {
  return alicuota !== "exento" && alicuota !== "no_gravado";
}

/**
 * Calcula neto, IVA y total agrupando por alícuota.
 *
 * El redondeo fiscal se aplica UNA vez por grupo, sobre la base ya sumada, y
 * el total se arma sumando los grupos redondeados. Redondear ítem por ítem, o
 * redondear el total por separado, haría que la declaración a ARCA no cierre.
 */
export function calcularComprobante(
  items: readonly LineaItem[],
  moneda: Moneda,
): ComprobanteCalculado {
  const basesPorAlicuota = new Map<AlicuotaIva, Money>();

  for (const item of items) {
    const base = Money.desdeString(item.precioUnitario, moneda)
      .multiplicarPor(item.cantidad)
      .redondeoFiscal();
    const acumulada = basesPorAlicuota.get(item.alicuotaIva) ?? Money.cero(moneda);
    basesPorAlicuota.set(item.alicuotaIva, acumulada.sumar(base));
  }

  const porAlicuota: GrupoAlicuota[] = [];
  for (const [alicuota, baseImponible] of basesPorAlicuota) {
    if (!esPorcentaje(alicuota)) {
      continue;
    }
    porAlicuota.push({
      alicuota,
      baseImponible,
      importe: baseImponible.porcentaje(alicuota).redondeoFiscal(),
    });
  }

  const neto = Money.sumarTodos([...basesPorAlicuota.values()], moneda);
  const iva = Money.sumarTodos(
    porAlicuota.map((g) => g.importe),
    moneda,
  );

  return { neto, iva, total: neto.sumar(iva), porAlicuota };
}
