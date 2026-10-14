/**
 * Números y fechas como los imprime un papel argentino: una factura, un
 * extracto bancario.
 *
 * Los usan la lectura de comprobantes y la de extractos. Devuelven `null` ante
 * lo que no entienden, nunca un valor por defecto: un cero inventado en un
 * importe es peor que un campo vacío, porque se muestra como si alguien lo
 * hubiera cargado.
 *
 * `cotizaciones/dolar.ts` tiene un `aDecimal` parecido que no se comparte a
 * propósito: aquél **tira** ante un formato raro, porque una cotización mal
 * leída no se puede mostrar, y éstos devuelven null para que el campo quede
 * vacío y lo complete una persona.
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
