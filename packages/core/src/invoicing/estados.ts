/**
 * Ciclo de vida de un comprobante de venta, como función de transición pura.
 * Sin intérprete y sin dependencia en el frontend: la API expone los eventos
 * disponibles y la UI solo los renderiza.
 *
 * El pgEnum de Drizzle es la fuente de verdad de los estados; el backend tiene
 * un chequeo de paridad en tiempo de compilación contra esta lista.
 */
export const ESTADOS_COMPROBANTE = ["borrador", "enviada", "aprobada", "rechazada"] as const;

export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number];

export type EventoComprobante = "emitir" | "aprobar" | "rechazar" | "corregir";

export type ResultadoTransicion =
  | { ok: true; siguiente: EstadoComprobante }
  | { ok: false; motivo: string };

/**
 * Transiciones válidas. 'aprobada' no tiene salida: un comprobante con CAE es
 * inmutable y solo se corrige con una nota de crédito o débito.
 */
const TRANSICIONES: Record<
  EstadoComprobante,
  Partial<Record<EventoComprobante, EstadoComprobante>>
> = {
  borrador: { emitir: "enviada" },
  enviada: { aprobar: "aprobada", rechazar: "rechazada" },
  aprobada: {},
  rechazada: { corregir: "borrador" },
};

export function attemptTransition(
  estadoActual: EstadoComprobante,
  evento: EventoComprobante,
): ResultadoTransicion {
  const siguiente = TRANSICIONES[estadoActual][evento];
  if (!siguiente) {
    return {
      ok: false,
      motivo: `No se puede "${evento}" un comprobante en estado "${estadoActual}"`,
    };
  }
  return { ok: true, siguiente };
}

/** Lo que la API adjunta a cada entidad con estado para que la UI decida acciones. */
export function eventosDisponibles(estado: EstadoComprobante): EventoComprobante[] {
  return Object.keys(TRANSICIONES[estado]) as EventoComprobante[];
}

/** Solo el borrador lo edita el usuario; los demás estados los escribe la emisión. */
export function esEditable(estado: EstadoComprobante): boolean {
  return estado === "borrador";
}
