/**
 * `@erp/arca` — el borde con la facturación electrónica de ARCA (ex AFIP).
 *
 * Hoy este paquete define **el contrato y un doble para los tests**, no la
 * integración: `IFacturacionElectronica` con sus tipos, y
 * `FacturacionElectronicaFake`, que aplica las reglas del servicio que al
 * código que emite le importan. Los adaptadores reales de WSAA y WSFEv1 no
 * están escritos. El README del paquete explica el diseño previsto y por qué
 * el contrato es éste.
 *
 * Tener la interfaz antes que la integración no es ceremonia: la emisión
 * —numerar sin huecos, reintentar sin duplicar, congelar el comprobante al
 * recibir el CAE— se puede escribir y probar entera contra el fake, y es la
 * parte donde un error cuesta caro.
 */

export { ArcaNoAutenticadoError, ArcaNoDisponibleError } from "./errores.js";
export { FacturacionElectronicaFake, type OpcionesFake } from "./fake.js";
export type {
  AlicuotaLiquidada,
  ClaseComprobante,
  ComprobanteAsociado,
  IFacturacionElectronica,
  Observacion,
  PuntoDeNumeracion,
  Receptor,
  ResultadoCae,
  SolicitudCae,
} from "./tipos.js";
