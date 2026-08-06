import { Money } from "../money/index.js";

/**
 * Proyección de caja a 13 semanas (sección 8.2). Es el estándar de gestión de
 * tesorería para PyMEs: detalle semanal en el corto plazo, donde el faltante de
 * caja es accionable, y alcance suficiente para ver vencimientos concentrados
 * que un horizonte de 30 días no muestra.
 */
export const HORIZONTE_SEMANAS = 13;

export interface SemanaHorizonte {
  semana: number;
  inicio: string;
  fin: string;
}

export interface MovimientoProyectado {
  fecha: string;
  importe: Money;
}

export interface FilaProyeccion extends SemanaHorizonte {
  cobros: Money;
  pagos: Money;
  saldoInicial: Money;
  saldoFinal: Money;
  semaforo: "ok" | "alerta";
}

const MS_POR_DIA = 86_400_000;

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number): string {
  return aISO(new Date(aFecha(iso).getTime() + dias * MS_POR_DIA));
}

/** Lunes de la semana que contiene la fecha (la semana comercial arranca lunes). */
function lunesDe(iso: string): string {
  const fecha = aFecha(iso);
  // getUTCDay: 0 = domingo, 1 = lunes… El domingo pertenece a la semana que
  // arrancó 6 días antes, no a la que empieza al día siguiente.
  const diaSemana = fecha.getUTCDay();
  const desplazamiento = diaSemana === 0 ? 6 : diaSemana - 1;
  return sumarDias(iso, -desplazamiento);
}

/** Las 13 semanas del horizonte, arrancando por la semana en curso. */
export function semanasDelHorizonte(hoy: string): SemanaHorizonte[] {
  const primerLunes = lunesDe(hoy);
  return Array.from({ length: HORIZONTE_SEMANAS }, (_, i) => {
    const inicio = sumarDias(primerLunes, i * 7);
    return { semana: i + 1, inicio, fin: sumarDias(inicio, 6) };
  });
}

/**
 * Arma la proyección encadenando el saldo: el final de cada semana es el
 * inicial de la siguiente. Lo que cae fuera del horizonte se ignora.
 *
 * El semáforo compara contra el mínimo operativo que define cada empresa; si no
 * lo definió, solo avisa cuando el saldo se va a negativo.
 */
export function proyectarCaja(entrada: {
  hoy: string;
  saldoInicial: Money;
  cobros: readonly MovimientoProyectado[];
  pagos: readonly MovimientoProyectado[];
  minimoOperativo: Money | null;
}): FilaProyeccion[] {
  const { hoy, saldoInicial, cobros, pagos, minimoOperativo } = entrada;
  const moneda = saldoInicial.moneda;
  const semanas = semanasDelHorizonte(hoy);

  const sumarEnSemana = (movimientos: readonly MovimientoProyectado[], s: SemanaHorizonte) =>
    Money.sumarTodos(
      movimientos.filter((m) => m.fecha >= s.inicio && m.fecha <= s.fin).map((m) => m.importe),
      moneda,
    );

  let arrastre = saldoInicial;
  return semanas.map((s) => {
    const cobrosSemana = sumarEnSemana(cobros, s);
    const pagosSemana = sumarEnSemana(pagos, s);
    const inicial = arrastre;
    const final = inicial.sumar(cobrosSemana).restar(pagosSemana);
    arrastre = final;

    const bajoMinimo = minimoOperativo ? final.menorQue(minimoOperativo) : final.esNegativo();

    return {
      ...s,
      cobros: cobrosSemana,
      pagos: pagosSemana,
      saldoInicial: inicial,
      saldoFinal: final,
      semaforo: bajoMinimo ? "alerta" : "ok",
    };
  });
}
