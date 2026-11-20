import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Money } from "@erp/core/money";
import escribirXlsx, { type SheetData } from "write-excel-file/node";

/**
 * Genera un `.xlsx` con la forma en que un banco imprime un extracto.
 *
 * Existe porque conciliar es la única pantalla del sistema cuya entrada es un
 * archivo binario: sin esto, probarla de punta a punta pide un Excel fijo
 * guardado en el repositorio, y un binario que nadie puede leer en un diff es
 * un fixture que nadie va a mantener. Acá las líneas se escriben en texto, al
 * lado de lo que el test afirma sobre ellas.
 *
 * Dos cosas imitan al banco de verdad y no son decoración:
 *
 * - **Todas las celdas son texto**, con fechas `DD/MM/YYYY` e importes
 *   `1.234,56`. Así las exporta Galicia y así las espera el lector: si acá se
 *   escribieran números de Excel, el test pasaría con una entrada que ningún
 *   banco produce.
 * - **El importe va en dos columnas**, Débito y Crédito, que es el formato más
 *   común. El lector también acepta una sola columna con signo; para ejercitar
 *   ese camino está `escribirExtractoDeUnaColumna`.
 *
 * El saldo corrido lo calcula esta función y no quien la llama. El lector
 * verifica que cada saldo sea el anterior más el importe de la línea, así que
 * un extracto con el saldo mal hecho prueba el mensaje de error y no la
 * lectura — y a mano, esa cuenta se equivoca.
 */

export interface MovimientoDeExtracto {
  /** ISO, `AAAA-MM-DD`: lo que devuelve la base. Se imprime a la argentina. */
  fecha: string;
  descripcion: string;
  /** Con signo y con punto decimal: `-145000.00` es un débito. */
  importe: string;
}

export interface ExtractoAEscribir {
  /** Lo que el banco imprime arriba del encabezado: banco, cuenta, período. */
  cabecera: string[];
  /** El saldo con que abre el período, antes de la primera línea. */
  saldoInicial: string;
  /** En orden cronológico, como los imprime el banco. */
  movimientos: readonly MovimientoDeExtracto[];
}

const MONEDA = "ARS" as const;

/** `2026-11-18` → `18/11/2026`. Sin `Date`: no hay zona horaria que errar. */
function aFechaArgentina(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  if (!anio || !mes || !dia) {
    throw new Error(`Fecha que no es ISO: "${iso}"`);
  }
  return `${dia}/${mes}/${anio}`;
}

/**
 * `1234.5` → `1.234,50`, y `-1234.5` → `-1.234,50`.
 *
 * El signo se conserva porque el saldo corrido puede ser negativo y el banco
 * lo imprime como tal. Las columnas de Débito y Crédito, en cambio, llevan el
 * importe sin signo —la columna ya dice el sentido—, así que son ellas las
 * que lo sacan, con `sinSigno`.
 */
function aImporteArgentino(importe: Money): string {
  const negativo = importe.esNegativo();
  const [entera = "0", decimal = "00"] = importe.aString().replace("-", "").split(".");
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${miles},${decimal.padEnd(2, "0").slice(0, 2)}`;
}

/** El importe como lo imprime una columna que ya dice el sentido. */
function sinSigno(importe: Money): string {
  return aImporteArgentino(importe.esNegativo() ? importe.negar() : importe);
}

/** Toda celda es texto: así imprime el banco y así espera el lector. */
function celda(value: string): { value: string; type: StringConstructor } {
  return { value, type: String };
}

/**
 * Las filas del extracto, con el saldo corrido ya calculado.
 *
 * Devuelve también el saldo final, que es lo que un test quiere afirmar
 * después de conciliar sin volver a sumar a mano.
 */
function armarFilas(
  extracto: ExtractoAEscribir,
  encabezado: string[],
  columnasDeLinea: (movimiento: MovimientoDeExtracto, importe: Money) => string[],
): { filas: SheetData; saldoFinal: Money } {
  const filas: SheetData = extracto.cabecera.map((linea) => [celda(linea)]);
  filas.push(encabezado.map(celda));

  let saldo = Money.desdeString(extracto.saldoInicial, MONEDA);
  for (const movimiento of extracto.movimientos) {
    const importe = Money.desdeString(movimiento.importe, MONEDA);
    saldo = saldo.sumar(importe);
    filas.push(
      [
        aFechaArgentina(movimiento.fecha),
        movimiento.descripcion,
        ...columnasDeLinea(movimiento, importe),
        aImporteArgentino(saldo),
      ].map(celda),
    );
  }
  return { filas, saldoFinal: saldo };
}

/** Las columnas se dimensionan por el encabezado: la descripción es la ancha. */
async function guardar(ruta: string, filas: SheetData, anchos: number[]): Promise<void> {
  mkdirSync(dirname(ruta), { recursive: true });
  // En la 4.x la llamada no recibe la ruta: devuelve `toFile`/`toBuffer`.
  await escribirXlsx(filas, {
    sheet: "Movimientos",
    columns: anchos.map((width) => ({ width })),
  }).toFile(ruta);
}

/** Débito y Crédito en columnas separadas, como lo imprime Galicia. */
export async function escribirExtracto(
  ruta: string,
  extracto: ExtractoAEscribir,
): Promise<{ saldoFinal: Money }> {
  const { filas, saldoFinal } = armarFilas(
    extracto,
    ["Fecha", "Movimiento", "Débito", "Crédito", "Saldo parcial"],
    (_movimiento, importe) =>
      importe.esNegativo() ? [sinSigno(importe), ""] : ["", sinSigno(importe)],
  );
  await guardar(ruta, filas, [12, 46, 14, 14, 16]);
  return { saldoFinal };
}

/** Una sola columna de importe, con signo, como lo imprimen otros bancos. */
export async function escribirExtractoDeUnaColumna(
  ruta: string,
  extracto: ExtractoAEscribir,
): Promise<{ saldoFinal: Money }> {
  const { filas, saldoFinal } = armarFilas(
    extracto,
    ["Fecha", "Concepto", "Importe", "Saldo"],
    (_movimiento, importe) => [aImporteArgentino(importe)],
  );
  await guardar(ruta, filas, [12, 46, 16, 16]);
  return { saldoFinal };
}
