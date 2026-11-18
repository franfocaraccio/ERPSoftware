import { createHash } from "node:crypto";
import { ArcaNoDisponibleError } from "./errores.js";
import type {
  IFacturacionElectronica,
  Observacion,
  PuntoDeNumeracion,
  ResultadoCae,
  SolicitudCae,
} from "./tipos.js";

/**
 * Un ARCA de juguete, para los tests del código que emite.
 *
 * No habla con nada: lleva la numeración en memoria y aplica a mano las pocas
 * reglas del servicio real que al código que llama le importan. No pretende
 * ser fiel —el servicio real tiene decenas de validaciones y códigos de
 * error—, sino **exigir lo mismo en lo que un bug sería grave**: un hueco en
 * la numeración, un total que no cierra, un reintento que emite dos veces.
 *
 * Es determinista a propósito: el mismo comprobante da el mismo CAE, en
 * cualquier corrida y sin mirar el reloj, así que un test puede afirmar un
 * valor concreto.
 */

/** Días de validez que el fake le da a un CAE, contados desde la emisión. */
const DIAS_DE_VIGENCIA = 10;

export interface OpcionesFake {
  /**
   * Hacer fallar los primeros N pedidos con `ArcaNoDisponibleError`.
   *
   * Para probar el camino del reintento, que es distinto del rechazo: un
   * servicio caído no consume número ni toma la clave de idempotencia.
   */
  caidoLasPrimeras?: number;
}

export class FacturacionElectronicaFake implements IFacturacionElectronica {
  private readonly numeros = new Map<string, number>();
  private readonly emitidos = new Map<string, ResultadoCae>();
  private caidasPendientes: number;

  constructor(opciones: OpcionesFake = {}) {
    this.caidasPendientes = opciones.caidoLasPrimeras ?? 0;
  }

  ultimoAutorizado(punto: PuntoDeNumeracion): Promise<number> {
    return Promise.resolve(this.numeros.get(clave(punto)) ?? 0);
  }

  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae> {
    if (this.caidasPendientes > 0) {
      this.caidasPendientes--;
      return Promise.reject(
        new ArcaNoDisponibleError("El servicio de facturación no está respondiendo."),
      );
    }

    // Lo primero, antes de cualquier validación: el mismo comprobante devuelve
    // lo mismo que la primera vez. Un reintento no vuelve a emitir.
    const yaEmitido = this.emitidos.get(solicitud.idempotencia);
    if (yaEmitido) {
      return Promise.resolve(yaEmitido);
    }

    const problema = revisar(solicitud, this.numeros.get(clave(solicitud)) ?? 0);
    if (problema) {
      // Un rechazo no avanza la numeración ni ocupa la clave: corregir el
      // comprobante y volver a pedirlo con el mismo número es lo correcto.
      return Promise.resolve({ estado: "rechazado", errores: [problema] });
    }

    const resultado: ResultadoCae = {
      estado: "autorizado",
      cae: caeDe(solicitud),
      vencimiento: sumarDias(solicitud.fechaEmision, DIAS_DE_VIGENCIA),
      observaciones: [],
    };
    this.numeros.set(clave(solicitud), solicitud.numero);
    this.emitidos.set(solicitud.idempotencia, resultado);
    return Promise.resolve(resultado);
  }
}

function clave(punto: PuntoDeNumeracion): string {
  return [punto.cuitEmisor, punto.puntoVenta, punto.clase, punto.letra].join("|");
}

/**
 * Las validaciones que el fake replica. Devuelve la primera que falla, como
 * hace el servicio.
 *
 * **Los códigos son inventados.** Tienen la forma de los de ARCA y sirven para
 * que el código que llama pueda distinguir una causa de otra, pero no se
 * verificaron contra la tabla oficial. El adaptador real tiene que traer los
 * de verdad, y ahí estos se van.
 */
function revisar(solicitud: SolicitudCae, ultimo: number): Observacion | null {
  if (solicitud.numero !== ultimo + 1) {
    return {
      codigo: 10016,
      mensaje: `La numeración no puede tener huecos: el último autorizado es ${ultimo} y se pidió el ${solicitud.numero}.`,
    };
  }

  if (!solicitud.neto.sumar(solicitud.iva).igualA(solicitud.total)) {
    return {
      codigo: 10048,
      mensaje: "El total declarado no es la suma del neto más el IVA.",
    };
  }

  // La A es entre inscriptos: siempre identifica al receptor con CUIT. La B y
  // la C admiten consumidor final sin identificar.
  if (solicitud.letra === "A" && solicitud.receptor?.tipoDocumento !== "CUIT") {
    return {
      codigo: 10015,
      mensaje: "Una factura A tiene que identificar al receptor con su CUIT.",
    };
  }

  if (solicitud.clase !== "factura" && solicitud.asociados.length === 0) {
    return {
      codigo: 10052,
      mensaje: "Una nota de crédito o débito tiene que declarar el comprobante asociado.",
    };
  }

  return null;
}

/**
 * Un CAE de 14 dígitos derivado del comprobante.
 *
 * El real lo asigna ARCA y no se puede predecir. Acá se deriva del pedido para
 * que sea estable entre corridas: dos comprobantes distintos reciben CAEs
 * distintos, y el mismo comprobante siempre el mismo.
 */
function caeDe(solicitud: SolicitudCae): string {
  const huella = createHash("sha256")
    .update(
      [
        solicitud.cuitEmisor,
        solicitud.puntoVenta,
        solicitud.clase,
        solicitud.letra,
        solicitud.numero,
        solicitud.fechaEmision,
        solicitud.total.aStringFiscal(),
      ].join("|"),
    )
    .digest("hex");
  const numero = BigInt(`0x${huella.slice(0, 16)}`) % 100000000000000n;
  return numero.toString().padStart(14, "0");
}

/** "2026-11-17" + 10 → "2026-11-27", en UTC para que el huso no mueva el día. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
