/**
 * Lo que sale por excepción y no por resultado.
 *
 * La distinción importa y no es estética. Un **rechazo** llega como
 * `ResultadoCae`: el comprobante no se autorizó, el número sigue libre y hay
 * algo concreto que corregir. Un **error de estos** significa que no se sabe
 * qué pasó: el pedido pudo haber llegado, pudo haberse autorizado, y la
 * respuesta no volvió. El camino correcto ahí es reintentar con la misma clave
 * de idempotencia, nunca emitir de nuevo con otro número.
 */

/** El servicio no contestó, o contestó algo que no se pudo interpretar. */
export class ArcaNoDisponibleError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ArcaNoDisponibleError";
  }
}

/** El certificado o el ticket de acceso no sirven: no es algo que se reintente solo. */
export class ArcaNoAutenticadoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ArcaNoAutenticadoError";
  }
}
