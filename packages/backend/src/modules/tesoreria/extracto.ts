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
 * imprime al derecho, se sigue leyendo.
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
  saldo: ["saldo parcial", "saldo"],
} as const;

type Columna = keyof typeof NOMBRES;

function ubicarColumnas(encabezado: Celda[]): Partial<Record<Columna, number>> {
  const nombres = encabezado.map(normalizar);
  const ubicadas: Partial<Record<Columna, number>> = {};
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
 * Primero por fecha. Pero un extracto de un solo día no dice su orden por la
 * fecha, así que si la cadena del saldo no cierra y al revés sí, vale al
 * revés: el saldo es el que sabe en qué orden pasaron las cosas.
 */
function enOrdenCronologico(lineas: LineaExtracto[]): LineaExtracto[] {
  const primera = lineas[0]?.fecha ?? "";
  const ultima = lineas.at(-1)?.fecha ?? "";
  const porFecha = primera > ultima ? [...lineas].reverse() : lineas;
  const renumerar = (ls: LineaExtracto[]) => ls.map((l, indice) => ({ ...l, indice }));

  const candidata = renumerar(porFecha);
  if (candidata.length > 1 && !verificarSaldoCorrido(candidata).ok) {
    const alReves = renumerar([...porFecha].reverse());
    if (verificarSaldoCorrido(alReves).ok) {
      return alReves;
    }
  }
  return candidata;
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
  const { fecha: cFecha, debito: cDebito, credito: cCredito, saldo: cSaldo } = columnas;
  if (
    cDebito === undefined ||
    cCredito === undefined ||
    cFecha === undefined ||
    cSaldo === undefined
  ) {
    throw new ExtractoNoReconocidoError(
      "El extracto tiene que tener columnas de Débito y de Crédito.",
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

    const debito = aImporte(fila[cDebito] ?? "");
    const credito = aImporte(fila[cCredito] ?? "");
    if (debito === null || credito === null) {
      filasIlegibles.push({ fila: numeroDeFila, motivo: "importe" });
      return;
    }
    const saldo = aImporte(fila[cSaldo] ?? "");
    if (saldo === null) {
      filasIlegibles.push({ fila: numeroDeFila, motivo: "saldo" });
      return;
    }

    // Galicia imprime el débito con signo menos; otro banco puede no hacerlo.
    // Con el valor absoluto da lo mismo.
    const d = ars(debito);
    leidas.push({
      indice: leidas.length,
      fecha,
      descripcion:
        columnas.descripcion === undefined ? "" : unaLinea(fila[columnas.descripcion] ?? null),
      importe: ars(credito).restar(d.esNegativo() ? d.negar() : d),
      saldo: ars(saldo),
    });
  });

  if (leidas.length === 0) {
    throw new ExtractoNoReconocidoError("El extracto no tiene ningún movimiento.");
  }

  const lineas = enOrdenCronologico(leidas);
  return { cuenta, lineas, saldo: verificarSaldoCorrido(lineas), filasIlegibles };
}
