import { hoyEnArgentina } from "@erp/core/dates";

/**
 * Una fecha relativa a hoy, en el formato `date` de Postgres.
 *
 * Cuenta los días desde **hoy en la zona del negocio**, que es la que usa el
 * código (`hoyEnArgentina`). Esto no es un detalle: cada archivo de test tenía
 * su copia armada con `new Date().getDate()`, o sea con la zona de la máquina.
 * En una máquina argentina las dos coinciden y los tests pasan; en CI, que
 * corre en UTC, entre las 21 y la medianoche de acá ya es el día siguiente
 * allá, y un comprobante "emitido hace 50 días" quedaba vencido hace 19 en vez
 * de 20. Fallaba de noche y pasaba de mañana.
 */
export function enDias(dias: number): string {
  const d = new Date(`${hoyEnArgentina()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
