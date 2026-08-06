/**
 * Zona horaria de referencia del negocio. Los vencimientos fiscales, los días
 * para cobro y la fecha por defecto de los movimientos son conceptos locales:
 * calcularlos en UTC adelanta un día a partir de las 21:00 hora argentina.
 */
export const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

const FORMATEADORES = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = FORMATEADORES.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    FORMATEADORES.set(zona, f);
  }
  return f;
}

/**
 * Fecha calendario (YYYY-MM-DD) de un instante en una zona horaria.
 * El locale en-CA ya produce ese formato, así que no hay que recomponerlo.
 */
export function fechaISOEnZona(instante: Date, zona: string): string {
  return formateador(zona).format(instante);
}

/** Hoy según la zona del negocio. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  return fechaISOEnZona(ahora, ZONA_ARGENTINA);
}
