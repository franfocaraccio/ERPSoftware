import { type Moneda, Money } from "../money/index.js";
import type { MovimientoProyectado } from "./proyeccion.js";

export interface Separacion {
  /** Vencen hoy o después: entran en la proyección por su fecha. */
  vigentes: MovimientoProyectado[];
  /** Vencían antes de hoy y siguen impagos. */
  vencidos: MovimientoProyectado[];
  /** Los mismos vencidos, reprogramados a hoy. */
  vencidosAHoy: MovimientoProyectado[];
  totalVencido: Money;
}

/**
 * Separa lo vencido de lo vigente antes de proyectar.
 *
 * `proyectarCaja` ignora lo que cae antes de la primera semana, y eso está bien
 * para el horizonte, pero no para la deuda: una compra o un impuesto vencidos e
 * impagos siguen siendo plata que hay que poner. Quien llama decide qué hacer
 * con cada lado: los pagos vencidos van a hoy (`vencidosAHoy`) y los cobros
 * vencidos no se proyectan, por prudencia, y se informan aparte
 * (`totalVencido`).
 */
export function separarVencidos(
  movimientos: readonly MovimientoProyectado[],
  hoy: string,
  moneda: Moneda = "ARS",
): Separacion {
  const vigentes = movimientos.filter((m) => m.fecha >= hoy);
  const vencidos = movimientos.filter((m) => m.fecha < hoy);
  return {
    vigentes,
    vencidos,
    vencidosAHoy: vencidos.map((m) => ({ fecha: hoy, importe: m.importe })),
    totalVencido: Money.sumarTodos(
      vencidos.map((m) => m.importe),
      moneda,
    ),
  };
}
