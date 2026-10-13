import { normalizarCuit, validarCuit } from "@erp/core/tax";

/**
 * Normalizadores de lo que se lee de un comprobante en papel.
 *
 * El criterio de fondo: **al modelo se le pide que copie lo que ve, no que
 * convierta.** Copiar es lo que hace bien; convertir "1.382,01" a un decimal o
 * "21/09/2026" a ISO es determinístico y barato, así que lo hace el código,
 * donde además se puede probar. Un modelo que convierte devuelve con la misma
 * cara un número bien convertido y uno inventado.
 *
 * Todos devuelven `null` ante algo que no entienden, nunca un valor por
 * defecto: un cero inventado en un importe es peor que un campo vacío, porque
 * el formulario lo muestra como si alguien lo hubiera cargado.
 *
 * Nota: `cotizaciones/dolar.ts` tiene un `aDecimal` parecido. No se comparten a
 * propósito: aquél **tira** ante un formato raro, porque una cotización mal
 * leída no se puede mostrar, y éste **devuelve null** para que el campo quede
 * vacío y lo complete una persona. Si aparece un tercero, conviene unificarlos.
 */

/** "1.382,01" → "1382.01". Punto de miles, coma decimal. */
export function aImporte(valor: string): string | null {
  const limpio = valor.replace(/[\s$]|USD|ARS/g, "");
  if (limpio === "") {
    return null;
  }
  // Un solo separador decimal, y los puntos de miles sólo antes de la coma.
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(limpio)) {
    return null;
  }
  const decimal = limpio.replace(/\./g, "").replace(",", ".");
  return Number.isNaN(Number(decimal)) ? null : decimal;
}

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * "21/9/2026" → "2026-09-21".
 *
 * Corta el string y no construye un `Date`: construirlo interpreta la fecha
 * como medianoche UTC y, mostrada en hora argentina, cae un día antes. Es el
 * mismo criterio que `formatearFecha` en el frontend.
 */
export function aFechaIso(valor: string): string | null {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor.trim());
  if (!partes) {
    return null;
  }
  const [, d = "", m = "", a = ""] = partes;
  const dia = Number(d);
  const mes = Number(m);
  if (mes < 1 || mes > 12 || dia < 1 || dia > (DIAS_POR_MES[mes - 1] ?? 0)) {
    return null;
  }
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Los once dígitos de un CUIT, o `null`.
 *
 * Se valida el dígito verificador, que es justamente lo que distingue un CUIT
 * bien leído de uno con un dígito cambiado por el OCR. Un CUIT que no verifica
 * no sirve ni para buscar al proveedor ni para cargarlo.
 */
export function cuitLeido(valor: string): string | null {
  const normalizado = normalizarCuit(valor);
  return validarCuit(normalizado) ? normalizado : null;
}

export interface Numeracion {
  puntoVenta: number;
  numero: number;
}

/**
 * Punto de venta y número, vengan en dos campos o pegados.
 *
 * Las facturas de ARCA los imprimen separados ("Punto de Venta: 00002",
 * "Comp. Nro: 00000080"), pero un ticket los junta en uno solo
 * ("Nro. Comprobante: 02715-00574048"). Los ceros a la izquierda son relleno de
 * impresión: las columnas son `integer`.
 */
export function aNumeracion(puntoVenta: string, numero?: string): Numeracion | null {
  if (numero === undefined) {
    const pegado = /^(\d+)-(\d+)$/.exec(puntoVenta.trim());
    return pegado ? aNumeracion(pegado[1] ?? "", pegado[2] ?? "") : null;
  }
  const pv = /^\d+$/.test(puntoVenta.trim()) ? Number(puntoVenta) : null;
  const nro = /^\d+$/.test(numero.trim()) ? Number(numero) : null;
  return pv === null || nro === null ? null : { puntoVenta: pv, numero: nro };
}
