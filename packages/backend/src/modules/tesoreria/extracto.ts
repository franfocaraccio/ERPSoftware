import { Money } from "@erp/core/money";
import {
  type LineaExtracto,
  type VerificacionSaldo,
  verificarSaldoCorrido,
} from "@erp/core/treasury";
import { aFechaIso, aImporte } from "../_comunes/formato-argentino.js";
import type { Celda } from "./xlsx.js";

/**
 * De las filas de un extracto bancario a líneas con fecha, importe y saldo.
 *
 * Está pensado con el de Galicia delante, pero no atado a él: las columnas se
 * encuentran por su nombre, no por su posición, y el orden cronológico se
 * deduce de las fechas en vez de suponerlo. Si el banco agrega una columna o
 * imprime al derecho, se sigue leyendo. El importe puede venir en dos columnas,
 * Débito y Crédito como lo imprime Galicia, o en una sola con signo, como lo
 * imprimen otros bancos.
 *
 * No descarta nada en silencio. Una fila con fecha pero con el importe
 * ilegible se informa con su número de fila del Excel; saltearla rompería el
 * saldo corrido sin decir por qué.
 */

/** El Excel se leyó, pero no tiene forma de extracto bancario. */
export class ExtractoNoReconocidoError extends Error {}

export interface FilaIlegible {
  /** Número de fila en el Excel, empezando en 1, para que se la pueda buscar. */
  fila: number;
  motivo: "importe" | "saldo";
}

export interface Extracto {
  /** Lo que el banco imprime arriba del encabezado: banco, cuenta, período. */
  cuenta: string[];
  /** En orden cronológico, de la más vieja a la más nueva. */
  lineas: LineaExtracto[];
  saldo: VerificacionSaldo;
  filasIlegibles: FilaIlegible[];
}

/** "Débito" → "debito": sin tildes, en minúsculas y sin espacios de más. */
function normalizar(texto: Celda): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Los nombres con que cada banco titula cada columna. */
const NOMBRES = {
  fecha: ["fecha"],
  descripcion: ["movimiento", "concepto", "descripcion", "detalle"],
  debito: ["debito", "debitos"],
  credito: ["credito", "creditos"],
  importe: ["importe", "monto"],
  saldo: ["saldo parcial", "saldo"],
} as const;

type Columna = keyof typeof NOMBRES;
type Columnas = Partial<Record<Columna, number>>;

function ubicarColumnas(encabezado: Celda[]): Columnas {
  const nombres = encabezado.map(normalizar);
  const ubicadas: Columnas = {};
  for (const [columna, posibles] of Object.entries(NOMBRES) as [Columna, readonly string[]][]) {
    const indice = nombres.findIndex((n) => posibles.includes(n));
    if (indice >= 0) {
      ubicadas[columna] = indice;
    }
  }
  return ubicadas;
}

/** "  CREDITO TRANSFERENCIA\n Cliente SRL\n" → "CREDITO TRANSFERENCIA · Cliente SRL". */
function unaLinea(texto: Celda): string {
  return (texto ?? "")
    .split("\n")
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "")
    .join(" · ");
}

const ars = (valor: string) => Money.desdeString(valor, "ARS");

/**
 * Pone las líneas de la más vieja a la más nueva y les renumera el índice.
 *
 * Manda la fecha. Pero un extracto de un solo día no dice su orden por la
 * fecha, y ahí decide el saldo: si la cadena no cierra y al revés sí, vale al
 * revés, porque el saldo es el que sabe en qué orden pasaron las cosas.
 *
 * Ese desempate corre **sólo** cuando las fechas no alcanzan. Si las fechas ya
 * dicen el orden, se las respeta aunque la cadena no cierre: dar vuelta el
 * extracto hasta que cierre convierte una lectura equivocada en una que parece
 * buena, y la cadena del saldo deja de ser un control.
 */
function enOrdenCronologico(lineas: LineaExtracto[]): LineaExtracto[] {
  const primera = lineas[0]?.fecha ?? "";
  const ultima = lineas.at(-1)?.fecha ?? "";
  const porFecha = primera > ultima ? [...lineas].reverse() : lineas;
  const renumerar = (ls: LineaExtracto[]) => ls.map((l, indice) => ({ ...l, indice }));

  const candidata = renumerar(porFecha);
  const fechasDecidenElOrden = primera !== ultima;
  if (!fechasDecidenElOrden && candidata.length > 1 && !verificarSaldoCorrido(candidata).ok) {
    const alReves = renumerar([...porFecha].reverse());
    if (verificarSaldoCorrido(alReves).ok) {
      return alReves;
    }
  }
  return candidata;
}

/** Las dos formas de imprimir un importe que se saben leer. */
function tieneImporte(columnas: Columnas): boolean {
  return (
    (columnas.debito !== undefined && columnas.credito !== undefined) ||
    columnas.importe !== undefined
  );
}

/** Una celda que el banco dejó en blanco en vez de imprimir un cero. */
function estaVacia(celda: Celda): boolean {
  return (celda ?? "").trim() === "";
}

/**
 * El importe de una fila, con signo: negativo es un débito.
 *
 * Sale de Débito y Crédito si el banco usa dos columnas, o de la única columna
 * de importe si usa una. Con dos columnas, la que no corresponde puede venir
 * en "0,00" como la imprime Galicia o en blanco como la deja otro banco; en
 * blanco vale cero, pero las dos en blanco no son un movimiento de cero: son
 * una fila que no se pudo leer.
 *
 * Con una sola columna el signo tiene que estar en el archivo. No se deduce
 * del saldo a propósito: el saldo es el control de que la lectura estuvo bien,
 * y usarlo para completar lo que falta haría que cerrara siempre.
 */
function importeDeFila(fila: Celda[], columnas: Columnas): Money | null {
  const { debito: cDebito, credito: cCredito, importe: cImporte } = columnas;

  if (cDebito !== undefined && cCredito !== undefined) {
    const celdaDebito = fila[cDebito] ?? null;
    const celdaCredito = fila[cCredito] ?? null;
    if (estaVacia(celdaDebito) && estaVacia(celdaCredito)) {
      return null;
    }
    const debito = estaVacia(celdaDebito) ? "0" : aImporte(celdaDebito ?? "");
    const credito = estaVacia(celdaCredito) ? "0" : aImporte(celdaCredito ?? "");
    if (debito === null || credito === null) {
      return null;
    }
    // Galicia imprime el débito con signo menos; otro banco puede no hacerlo.
    // Con el valor absoluto da lo mismo.
    const d = ars(debito);
    return ars(credito).restar(d.esNegativo() ? d.negar() : d);
  }

  if (cImporte !== undefined) {
    const importe = aImporte(fila[cImporte] ?? "");
    return importe === null ? null : ars(importe);
  }
  return null;
}

export function interpretarExtracto(filas: Celda[][]): Extracto {
  const filaEncabezado = filas.findIndex((fila) => {
    const columnas = ubicarColumnas(fila);
    return columnas.fecha !== undefined && columnas.saldo !== undefined;
  });
  if (filaEncabezado < 0) {
    throw new ExtractoNoReconocidoError(
      "No se encontró el encabezado del extracto: hace falta al menos una columna Fecha y una de Saldo.",
    );
  }

  const columnas = ubicarColumnas(filas[filaEncabezado] ?? []);
  const { fecha: cFecha, saldo: cSaldo } = columnas;
  if (cFecha === undefined || cSaldo === undefined || !tieneImporte(columnas)) {
    throw new ExtractoNoReconocidoError(
      "El extracto tiene que tener columnas de Débito y de Crédito, o una sola de Importe.",
    );
  }

  const cuenta = filas
    .slice(0, filaEncabezado)
    .map((fila) => fila.filter((c) => c !== null && c.trim() !== "").join(" "))
    .filter((texto) => texto !== "");

  const leidas: LineaExtracto[] = [];
  const filasIlegibles: FilaIlegible[] = [];

  filas.slice(filaEncabezado + 1).forEach((fila, desplazamiento) => {
    const numeroDeFila = filaEncabezado + 2 + desplazamiento;
    const fecha = aFechaIso(fila[cFecha] ?? "");
    // Sin fecha no es un movimiento: es una fila vacía, un total o una nota.
    if (fecha === null) {
      return;
    }

    const importe = importeDeFila(fila, columnas);
    if (importe === null) {
      filasIlegibles.push({ fila: numeroDeFila, motivo: "importe" });
      return;
    }
    const saldo = aImporte(fila[cSaldo] ?? "");
    if (saldo === null) {
      filasIlegibles.push({ fila: numeroDeFila, motivo: "saldo" });
      return;
    }

    leidas.push({
      indice: leidas.length,
      fecha,
      descripcion:
        columnas.descripcion === undefined ? "" : unaLinea(fila[columnas.descripcion] ?? null),
      importe,
      saldo: ars(saldo),
    });
  });

  if (leidas.length === 0) {
    throw new ExtractoNoReconocidoError("El extracto no tiene ningún movimiento.");
  }

  const lineas = enOrdenCronologico(leidas);
  return { cuenta, lineas, saldo: verificarSaldoCorrido(lineas), filasIlegibles };
}
