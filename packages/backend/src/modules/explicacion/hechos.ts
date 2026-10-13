import { Money } from "@erp/core/money";
import { variacion } from "@erp/core/resultados";
import type { Actor } from "../../db/auditar.js";
import { resumenFinanciero } from "../financiero/service.js";
import { obtenerEstadoResultados, obtenerRentabilidad } from "../resultados/service.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

/** `1234567.8` → `$ 1.234.567,80`, sin pasar el importe por `number`. */
export function formatearPesos(valor: string): string {
  const negativo = valor.startsWith("-");
  const [entero = "0", decimales = "00"] = valor.replace("-", "").split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "−" : ""}$ ${conPuntos},${decimales.padEnd(2, "0").slice(0, 2)}`;
}

const pct = (v: string | null) => (v === null ? "sin dato" : `${v.replace(".", ",")} %`);

function ultimoDia(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export interface Hechos {
  periodo: string;
  periodoAnterior: string;
  /** Líneas de texto con números ya calculados: lo único que ve el modelo. */
  lineas: string[];
}

/**
 * Los hechos del último mes cerrado contra el anterior, todos calculados por
 * el sistema (core): ventas, margen, gastos por categoría, resultado,
 * rentabilidad por categoría de producto y las alertas de caja.
 *
 * El modelo no recibe datos crudos ni hace cuentas: recibe estas frases y las
 * redacta. Si un número está mal acá, está mal en la pantalla también.
 */
export async function armarHechos(actor: Actor): Promise<Hechos> {
  // Tres meses: el en curso (incompleto, no se compara) y los dos cerrados.
  const meses = await obtenerEstadoResultados(actor, 3);
  const [anterior, actual] = [meses[0], meses[1]];
  if (!anterior || !actual) {
    return { periodo: "", periodoAnterior: "", lineas: [] };
  }

  const lineas: string[] = [];
  const comparar = (nombre: string, a: string, b: string) => {
    const v = variacion(ars(a), ars(b));
    lineas.push(
      `${nombre}: ${formatearPesos(a)} en ${actual.periodo} contra ${formatearPesos(b)} en ${anterior.periodo} (${v.porcentaje === null ? "sin base" : `${v.porcentaje.startsWith("-") ? "" : "+"}${v.porcentaje.replace(".", ",")} %`}).`,
    );
  };

  comparar("Ventas netas", actual.ventas, anterior.ventas);
  lineas.push(
    `Margen bruto: ${pct(actual.margenPorcentual)} en ${actual.periodo} contra ${pct(anterior.margenPorcentual)} en ${anterior.periodo}.`,
  );
  comparar("Gastos", actual.totalGastos, anterior.totalGastos);
  for (const g of actual.gastos.slice(0, 4)) {
    const previo = anterior.gastos.find((x) => x.categoria === g.categoria)?.importe ?? "0.00";
    comparar(`Gasto en ${g.categoria}`, g.importe, previo);
  }
  comparar("Resultado neto", actual.resultadoNeto, anterior.resultadoNeto);

  // Dónde se movió el margen: por categoría de producto.
  const [rentActual, rentAnterior] = await Promise.all([
    obtenerRentabilidad(actor, {
      agrupar: "categoria",
      desde: `${actual.periodo}-01`,
      hasta: ultimoDia(actual.periodo),
    }),
    obtenerRentabilidad(actor, {
      agrupar: "categoria",
      desde: `${anterior.periodo}-01`,
      hasta: ultimoDia(anterior.periodo),
    }),
  ]);
  for (const r of rentActual.slice(0, 5)) {
    const previo = rentAnterior.find((x) => x.clave === r.clave);
    lineas.push(
      `Margen de la categoría ${r.clave}: ${pct(r.margenPorcentual)} en ${actual.periodo}${previo ? ` contra ${pct(previo.margenPorcentual)} en ${anterior.periodo}` : " (no vendió en el mes anterior)"}.`,
    );
  }

  const panel = await resumenFinanciero(actor);
  if (panel.alertas.primeraBajoMinimo) {
    const a = panel.alertas.primeraBajoMinimo;
    lineas.push(
      `Alerta de caja: en la semana que empieza el ${a.inicio} el saldo proyectado (${formatearPesos(a.saldoFinal)}) queda bajo el mínimo operativo.`,
    );
  }
  if (panel.alertas.primeraNegativa) {
    lineas.push(
      `Alerta de caja: en la semana que empieza el ${panel.alertas.primeraNegativa.inicio} el saldo proyectado queda en negativo.`,
    );
  }
  if (panel.cobrosVencidos !== "0.00") {
    lineas.push(`Hay ${formatearPesos(panel.cobrosVencidos)} de cobros vencidos sin cobrar.`);
  }

  return { periodo: actual.periodo, periodoAnterior: anterior.periodo, lineas };
}
