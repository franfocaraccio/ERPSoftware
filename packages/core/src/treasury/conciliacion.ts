import type { Money } from "../money/index.js";
import { diasParaCobro, type TipoMovimiento } from "./tesoreria.js";

/**
 * Conciliación bancaria: casar las líneas de un extracto contra los
 * movimientos ya cargados en el sistema.
 *
 * No hay que confundirla con la imputación. Conciliar es "esta línea del banco
 * es aquel movimiento que cargué"; imputar es "este cobro cancela aquellas
 * facturas", y ya existe. Esto resuelve sólo lo primero.
 *
 * Todo lo de acá **propone**: ninguna función escribe nada ni toma una
 * decisión que no se pueda deshacer mirando la pantalla.
 */

export interface LineaExtracto {
  /** Su posición en el extracto, para que la pantalla sepa de qué línea se habla. */
  indice: number;
  /** ISO, AAAA-MM-DD. */
  fecha: string;
  descripcion: string;
  /** Con signo: positivo entra plata (crédito), negativo sale (débito). */
  importe: Money;
  /** El saldo de la cuenta después de esta línea, como lo imprime el banco. */
  saldo: Money;
}

export interface MovimientoCandidato {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  /** Siempre positivo, como en la tabla: el sentido lo da `tipo`. */
  importe: Money;
}

export type VerificacionSaldo =
  | { ok: true; saldoInicial: Money; saldoFinal: Money }
  | { ok: false; indice: number; esperado: Money; leido: Money };

/**
 * Verifica que cada saldo sea el anterior más el importe de la línea.
 *
 * Es el control de la lectura entera, y es mejor que un total: no dice "algo
 * está mal", dice **en qué línea**. Un importe mal leído o una línea que falta
 * cortan la cadena exactamente ahí.
 *
 * Las líneas van en orden cronológico, de la más vieja a la más nueva. El
 * saldo de apertura no viene impreso: es el de la primera línea menos su
 * importe.
 */
export function verificarSaldoCorrido(lineas: readonly LineaExtracto[]): VerificacionSaldo {
  const [primera] = lineas;
  if (!primera) {
    throw new Error("Un extracto sin líneas no tiene saldo que verificar");
  }

  let anterior = primera.saldo;
  for (const linea of lineas.slice(1)) {
    const esperado = anterior.sumar(linea.importe);
    if (!esperado.igualA(linea.saldo)) {
      return { ok: false, indice: linea.indice, esperado, leido: linea.saldo };
    }
    anterior = linea.saldo;
  }

  return {
    ok: true,
    saldoInicial: primera.saldo.restar(primera.importe),
    saldoFinal: anterior,
  };
}

export type ResultadoLinea =
  | { tipo: "casa"; linea: number; movimientoId: string }
  | { tipo: "ambigua"; linea: number; candidatos: string[] }
  | { tipo: "sin_par"; linea: number };

export interface Conciliacion {
  lineas: ResultadoLinea[];
  /**
   * Movimientos cargados dentro del período del extracto que el banco no
   * muestra: un tipeo, o algo que todavía no se acreditó.
   */
  sinLinea: string[];
}

/**
 * Propone qué línea es qué movimiento.
 *
 * Una línea casa con un movimiento cuando coinciden el sentido, el importe
 * **exacto** y la fecha dentro de la tolerancia. Exacto porque las comisiones
 * y los impuestos bancarios vienen en líneas propias: un depósito no llega
 * descontado.
 *
 * Con un solo candidato, casa. Con más de uno **no elige**: dos cobros iguales
 * en la misma semana son lo más común, y casar el equivocado le imputa el
 * cobro al cliente que no es. Eso lo decide una persona.
 *
 * Un movimiento casa con una sola línea. Si casara con dos, conciliar daría por
 * cobrado dos veces lo que entró una.
 */
export function conciliar(
  lineas: readonly LineaExtracto[],
  movimientos: readonly MovimientoCandidato[],
  opciones: { toleranciaDias: number },
): Conciliacion {
  const usados = new Set<string>();

  const resultados: ResultadoLinea[] = lineas.map((linea) => {
    const tipo: TipoMovimiento = linea.importe.esNegativo() ? "egreso" : "ingreso";
    const importe = linea.importe.esNegativo() ? linea.importe.negar() : linea.importe;

    const candidatos = movimientos.filter(
      (m) =>
        !usados.has(m.id) &&
        m.tipo === tipo &&
        m.importe.igualA(importe) &&
        Math.abs(diasParaCobro(m.fecha, linea.fecha)) <= opciones.toleranciaDias,
    );

    const [unico] = candidatos;
    if (candidatos.length === 1 && unico) {
      usados.add(unico.id);
      return { tipo: "casa", linea: linea.indice, movimientoId: unico.id };
    }
    if (candidatos.length > 1) {
      return { tipo: "ambigua", linea: linea.indice, candidatos: candidatos.map((c) => c.id) };
    }
    return { tipo: "sin_par", linea: linea.indice };
  });

  // Lo que quedó sin casar dentro del período es lo que hay que mirar. Lo de
  // afuera no es asunto de este extracto: corresponde a otro.
  const fechas = lineas.map((l) => l.fecha).sort();
  const desde = fechas[0] ?? "";
  const hasta = fechas.at(-1) ?? "";
  const enAmbiguas = new Set(resultados.flatMap((r) => (r.tipo === "ambigua" ? r.candidatos : [])));
  const sinLinea = movimientos
    .filter(
      (m) => !usados.has(m.id) && !enAmbiguas.has(m.id) && m.fecha >= desde && m.fecha <= hasta,
    )
    .map((m) => m.id);

  return { lineas: resultados, sinLinea };
}
