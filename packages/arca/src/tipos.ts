import type { AlicuotaIva, CondicionIva, LetraComprobante } from "@erp/core/invoicing";
import type { Money } from "@erp/core/money";

/**
 * Los tipos del borde con ARCA, en el vocabulario del dominio.
 *
 * Son lo que el sistema le pide y lo que entiende de la respuesta, no lo que
 * viaja por el cable: los nombres de los campos del SOAP de WSFEv1, su orden y
 * sus códigos son problema del adaptador que los habla, y no se filtran acá.
 * Por eso los importes son `Money` y no números: el que convierte a la
 * representación del servicio es el adaptador, en un solo lugar.
 */

export type ClaseComprobante = "factura" | "nota_credito" | "nota_debito";

/**
 * Una secuencia de numeración.
 *
 * ARCA numera por emisor, punto de venta, clase y letra: la factura A del
 * punto 1 lleva una serie propia, distinta de la B del mismo punto. Es la
 * clave de todo lo que tenga que ver con huecos en la numeración.
 */
export interface PuntoDeNumeracion {
  cuitEmisor: string;
  puntoVenta: number;
  clase: ClaseComprobante;
  letra: LetraComprobante;
}

export interface Receptor {
  tipoDocumento: "CUIT" | "DNI";
  numeroDocumento: string;
}

export interface AlicuotaLiquidada {
  alicuota: AlicuotaIva;
  baseImponible: Money;
  importe: Money;
}

/** El comprobante que una nota de crédito o débito corrige. */
export interface ComprobanteAsociado {
  clase: ClaseComprobante;
  letra: LetraComprobante;
  puntoVenta: number;
  numero: number;
}

export interface SolicitudCae extends PuntoDeNumeracion {
  /**
   * La clave que hace que un reintento no emita dos comprobantes.
   *
   * Sale del comprobante que se está emitiendo, no del intento: el mismo
   * comprobante reintentado después de un timeout trae la misma clave, y la
   * respuesta tiene que ser la misma. Es la única defensa real contra emitir
   * dos veces, porque una respuesta que no llegó no se distingue de una que
   * nunca se produjo.
   */
  idempotencia: string;
  numero: number;
  /** ISO, AAAA-MM-DD. */
  fechaEmision: string;
  /** Obligatoria en el pedido desde abril de 2026, y se guarda como snapshot. */
  condicionIvaReceptor: CondicionIva;
  /** `null` es consumidor final sin identificar, que sólo la B y la C admiten. */
  receptor: Receptor | null;
  /** Cotización a pesos. "1.00" cuando el comprobante ya está en pesos. */
  cotizacion: string;
  neto: Money;
  iva: Money;
  /** La moneda del comprobante sale de acá: `Money` la lleva adentro. */
  total: Money;
  alicuotas: AlicuotaLiquidada[];
  asociados: ComprobanteAsociado[];
}

/** Un código y un texto, como los devuelve el servicio. */
export interface Observacion {
  codigo: number;
  mensaje: string;
}

/**
 * Qué pasó con el pedido.
 *
 * Un rechazo es un resultado, no una excepción: el comprobante no se autorizó
 * y hay algo que corregir. Que el servicio no conteste es otra cosa —ahí no se
 * sabe si se emitió— y eso sí viaja como excepción. Ver `errores.ts`.
 *
 * Un comprobante autorizado puede traer observaciones y seguir siendo válido;
 * se guardan porque explican, por ejemplo, un CAE otorgado con una fecha
 * distinta de la pedida.
 */
export type ResultadoCae =
  | { estado: "autorizado"; cae: string; vencimiento: string; observaciones: Observacion[] }
  | { estado: "rechazado"; errores: Observacion[] };

/**
 * El servicio de facturación electrónica, visto desde el sistema.
 *
 * Dos operaciones, y las dos están por una razón. `autorizar` es la que pide
 * el CAE. `ultimoAutorizado` existe porque la numeración no puede tener
 * huecos y la verdad de qué número sigue la tiene ARCA, no la base de datos:
 * si un pedido se cortó sin respuesta, el sistema puede creer que un número
 * está libre cuando ya se usó. Se consulta antes de emitir.
 */
export interface IFacturacionElectronica {
  /** El último número que ARCA autorizó para esa secuencia. 0 si no hay ninguno. */
  ultimoAutorizado(punto: PuntoDeNumeracion): Promise<number>;
  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae>;
}
