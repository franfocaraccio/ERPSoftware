import { participacion } from "../kpis/kpis.js";
import { Money } from "../money/index.js";

export interface GastoCategoria {
  categoria: string;
  importe: Money;
}

export interface MesResultados {
  /** `YYYY-MM`. */
  periodo: string;
  /** Ventas netas (sin IVA), con las notas de crédito restando. */
  ventas: Money;
  costoVentas: Money;
  gastos: readonly GastoCategoria[];
  /** IIBB: un impuesto sobre las ventas, que es gasto. El IVA no lo es. */
  impuestosSobreVentas: Money;
  otrosIngresos: Money;
}

export interface ResultadoMes {
  periodo: string;
  ventas: Money;
  costoVentas: Money;
  margenBruto: Money;
  /** Null sin ventas: no hay sobre qué calcular. */
  margenPorcentual: string | null;
  gastos: GastoCategoria[];
  totalGastos: Money;
  impuestosSobreVentas: Money;
  resultadoOperativo: Money;
  otrosIngresos: Money;
  /** Antes del impuesto a las ganancias. */
  resultadoNeto: Money;
}

/**
 * El estado de resultados de cada mes, en cascada:
 *
 *   ventas netas − costo de ventas = margen bruto
 *   − gastos por categoría − impuestos sobre ventas = resultado operativo
 *   + otros ingresos = resultado neto (antes de Ganancias)
 *
 * Es devengado: qué entra en cada mes lo decide quien arma las filas (las
 * ventas por fecha de emisión, los gastos por fecha del comprobante o del
 * movimiento), no la fecha en que se cobró o se pagó.
 */
export function estadoResultados(meses: readonly MesResultados[]): ResultadoMes[] {
  return [...meses]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((m) => {
      const moneda = m.ventas.moneda;
      const porCategoria = new Map<string, Money>();
      for (const g of m.gastos) {
        porCategoria.set(
          g.categoria,
          (porCategoria.get(g.categoria) ?? Money.cero(moneda)).sumar(g.importe),
        );
      }
      const gastos = [...porCategoria.entries()]
        .map(([categoria, importe]) => ({ categoria, importe }))
        .sort((a, b) =>
          b.importe.mayorQue(a.importe) ? 1 : a.importe.mayorQue(b.importe) ? -1 : 0,
        );
      const totalGastos = Money.sumarTodos(
        gastos.map((g) => g.importe),
        moneda,
      );
      const margenBruto = m.ventas.restar(m.costoVentas);
      const resultadoOperativo = margenBruto.restar(totalGastos).restar(m.impuestosSobreVentas);
      return {
        periodo: m.periodo,
        ventas: m.ventas,
        costoVentas: m.costoVentas,
        margenBruto,
        margenPorcentual: m.ventas.esPositivo() ? participacion(margenBruto, m.ventas) : null,
        gastos,
        totalGastos,
        impuestosSobreVentas: m.impuestosSobreVentas,
        resultadoOperativo,
        otrosIngresos: m.otrosIngresos,
        resultadoNeto: resultadoOperativo.sumar(m.otrosIngresos),
      };
    });
}

export interface PlantillaRecurrente {
  id: string;
  importe: Money;
  /** Día del mes, 1 a 31. Si el mes es más corto, cae el último día. */
  dia: number;
  /** ISO. La primera ocurrencia posible. */
  desde: string;
  /** ISO, o null si no termina. */
  hasta: string | null;
}

function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Las fechas en que vence cada gasto recurrente dentro de `[desde, hasta]`.
 * Sirve para proyectarlos: el sueldo y el alquiler no tienen comprobante,
 * pero se pagan todos los meses.
 */
export function ocurrenciasRecurrentes(
  plantillas: readonly PlantillaRecurrente[],
  desde: string,
  hasta: string,
): { id: string; fecha: string; importe: Money }[] {
  const resultado: { id: string; fecha: string; importe: Money }[] = [];
  for (const p of plantillas) {
    let [anio, mes] = desde.split("-").map(Number) as [number, number];
    while (true) {
      const dia = Math.min(p.dia, ultimoDia(anio, mes));
      const fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      if (fecha > hasta) {
        break;
      }
      if (fecha >= desde && fecha >= p.desde && (p.hasta === null || fecha <= p.hasta)) {
        resultado.push({ id: p.id, fecha, importe: p.importe });
      }
      mes += 1;
      if (mes > 12) {
        mes = 1;
        anio += 1;
      }
    }
  }
  return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface FilaRentabilidad {
  clave: string;
  ventas: Money;
  costo: Money;
  margen: Money;
  margenPorcentual: string | null;
}

/**
 * Ventas, costo y margen agrupados por una clave: un cliente, un producto o
 * una categoría de producto. Ordenado por margen en pesos: lo que más deja,
 * arriba; las fugas, abajo.
 */
export function rentabilidad(
  filas: readonly { clave: string; ventas: Money; costo: Money }[],
): FilaRentabilidad[] {
  const grupos = new Map<string, { ventas: Money; costo: Money }>();
  for (const f of filas) {
    const g = grupos.get(f.clave);
    grupos.set(f.clave, {
      ventas: g ? g.ventas.sumar(f.ventas) : f.ventas,
      costo: g ? g.costo.sumar(f.costo) : f.costo,
    });
  }
  return [...grupos.entries()]
    .map(([clave, g]) => {
      const margen = g.ventas.restar(g.costo);
      return {
        clave,
        ventas: g.ventas,
        costo: g.costo,
        margen,
        margenPorcentual: g.ventas.esPositivo() ? participacion(margen, g.ventas) : null,
      };
    })
    .sort((a, b) => (b.margen.mayorQue(a.margen) ? 1 : a.margen.mayorQue(b.margen) ? -1 : 0));
}
