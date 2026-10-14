import type { Propuesta, PropuestaLinea } from "./extracto.js";

/**
 * Qué hacer con cada línea del extracto.
 *
 * "Después" no manda nada: la línea queda sin resolver y vuelve a aparecer en
 * el próximo extracto. Es la salida segura cuando no se sabe qué es.
 */
export type Decision =
  | { accion: "conciliar"; movimientoId: string }
  | { accion: "crear" }
  | { accion: "ignorar" }
  | { accion: "despues" };

/**
 * Con qué arranca cada línea.
 *
 * - **Casa con un movimiento**: conciliar con ese. Es lo que se va a hacer
 *   casi siempre.
 * - **Sin par**: crear el movimiento. En una cuenta de la empresa, lo que el
 *   banco muestra y el sistema no tiene es lo que falta cargar: comisiones,
 *   impuestos, un cobro que nadie anotó.
 * - **Ambigua**: después. Con dos candidatos no se elige por la persona, porque
 *   casar el equivocado le imputa el cobro al cliente que no es.
 *
 * Nada de esto se aplica solo: es lo que aparece marcado, y se aplica recién
 * cuando la persona confirma.
 */
export function decisionInicial(linea: PropuestaLinea): Decision {
  if (linea.resultado === "casa" && linea.movimientoId !== null) {
    return { accion: "conciliar", movimientoId: linea.movimientoId };
  }
  if (linea.resultado === "sin_par") {
    return { accion: "crear" };
  }
  return { accion: "despues" };
}

/** A partir de cuántas líneas una propuesta sin coincidencias es sospechosa. */
const UMBRAL_SOSPECHA = 5;

/**
 * Si ninguna línea coincide con lo cargado, el extracto probablemente es de
 * otra cuenta.
 *
 * O es la primera vez que se concilia esta cuenta y todavía no tiene nada
 * cargado. Las dos cosas son posibles, y la pantalla no puede saber cuál: por
 * eso avisa y no decide. Con pocas líneas no se avisa, porque un extracto de
 * dos comisiones puede no casar con nada y estar perfecto.
 */
export function pareceOtraCuenta(propuesta: Propuesta): boolean {
  return (
    propuesta.lineas.length >= UMBRAL_SOSPECHA &&
    !propuesta.lineas.some((l) => l.resultado === "casa")
  );
}

/**
 * Con qué arranca cada línea de la propuesta.
 *
 * Normalmente, lo de `decisionInicial`. Pero si parece otra cuenta, lo que no
 * está cargado arranca **para después** y no para crear: subir el extracto
 * equivocado no puede estar a un clic de cargar cientos de movimientos falsos.
 * Crearlas todas sigue a un clic, pero un clic que dice lo que hace.
 */
export function decisionesIniciales(propuesta: Propuesta): Map<number, Decision> {
  const sospechosa = pareceOtraCuenta(propuesta);
  return new Map(
    propuesta.lineas.map((l) => {
      const d = decisionInicial(l);
      return [l.indice, sospechosa && d.accion === "crear" ? { accion: "despues" } : d];
    }),
  );
}

/** Aplica la misma decisión a todas las líneas que no están cargadas. */
export function aTodasLasSinPar(
  propuesta: Propuesta,
  decisiones: ReadonlyMap<number, Decision>,
  accion: "crear" | "ignorar" | "despues",
): Map<number, Decision> {
  const nuevas = new Map(decisiones);
  for (const l of propuesta.lineas) {
    if (l.resultado === "sin_par") {
      nuevas.set(l.indice, { accion });
    }
  }
  return nuevas;
}

export interface Resumen {
  conciliar: number;
  crear: number;
  ignorar: number;
  despues: number;
}

export function resumir(decisiones: ReadonlyMap<number, Decision>): Resumen {
  const r: Resumen = { conciliar: 0, crear: 0, ignorar: 0, despues: 0 };
  for (const d of decisiones.values()) {
    r[d.accion]++;
  }
  return r;
}

/** Lo que viaja al confirmar: una entrada por línea decidida. */
export type DecisionAEnviar =
  | { linea: LineaAEnviar; accion: "conciliar"; movimientoId: string }
  | {
      linea: LineaAEnviar;
      accion: "crear";
      medioPago: "transferencia";
      clienteId?: string;
      proveedorId?: string;
    }
  | { linea: LineaAEnviar; accion: "ignorar" };

interface LineaAEnviar {
  fecha: string;
  descripcion: string;
  importe: string;
  saldo: string;
}

/**
 * Las decisiones listas para mandar.
 *
 * Lo que quedó para después no viaja. Una línea creada lleva la contraparte
 * sugerida por el CUIT del banco, si la hubo: así el cobro nace ya atado a su
 * cliente y se puede imputar sin volver a buscarlo.
 */
export function aEnviar(
  propuesta: Propuesta,
  decisiones: ReadonlyMap<number, Decision>,
): DecisionAEnviar[] {
  const enviar: DecisionAEnviar[] = [];
  for (const l of propuesta.lineas) {
    const decision = decisiones.get(l.indice);
    const linea = {
      fecha: l.fecha,
      descripcion: l.descripcion,
      importe: l.importe,
      saldo: l.saldo,
    };
    if (decision === undefined || decision.accion === "despues") {
      continue;
    }
    if (decision.accion === "conciliar") {
      enviar.push({ linea, accion: "conciliar", movimientoId: decision.movimientoId });
    } else if (decision.accion === "ignorar") {
      enviar.push({ linea, accion: "ignorar" });
    } else {
      const s = l.sugerencia;
      enviar.push({
        linea,
        accion: "crear",
        medioPago: "transferencia",
        ...(s?.contraparte === "cliente" ? { clienteId: s.id } : {}),
        ...(s?.contraparte === "proveedor" ? { proveedorId: s.id } : {}),
      });
    }
  }
  return enviar;
}
