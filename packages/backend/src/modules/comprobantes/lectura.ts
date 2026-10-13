import { discriminaIva, type LetraComprobante, revisarTotalesLeidos } from "@erp/core/invoicing";
import { Money } from "@erp/core/money";
import { normalizarCuit, validarCuit } from "@erp/core/tax";
import { z } from "zod";

/**
 * Normalizadores de lo que se lee de un comprobante en papel.
 *
 * El criterio de fondo: **al modelo se le pide que copie lo que ve, no que
 * convierta.** Copiar es lo que hace bien; convertir "1.382,01" a un decimal o
 * "21/09/2026" a ISO es determinístico y barato, así que lo hace el código,
 * donde además se puede probar. Un modelo que convierte devuelve con la misma
 * cara un número bien convertido y uno inventado.
 *
 * Todos devuelven `null` ante algo que no entienden, nunca un valor por
 * defecto: un cero inventado en un importe es peor que un campo vacío, porque
 * el formulario lo muestra como si alguien lo hubiera cargado.
 *
 * Nota: `cotizaciones/dolar.ts` tiene un `aDecimal` parecido. No se comparten a
 * propósito: aquél **tira** ante un formato raro, porque una cotización mal
 * leída no se puede mostrar, y éste **devuelve null** para que el campo quede
 * vacío y lo complete una persona. Si aparece un tercero, conviene unificarlos.
 */

/** "1.382,01" → "1382.01". Punto de miles, coma decimal. */
export function aImporte(valor: string): string | null {
  const limpio = valor.replace(/[\s$]|USD|ARS/g, "");
  if (limpio === "") {
    return null;
  }
  // Un solo separador decimal, y los puntos de miles sólo antes de la coma.
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(limpio)) {
    return null;
  }
  const decimal = limpio.replace(/\./g, "").replace(",", ".");
  return Number.isNaN(Number(decimal)) ? null : decimal;
}

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * "21/9/2026" → "2026-09-21".
 *
 * Corta el string y no construye un `Date`: construirlo interpreta la fecha
 * como medianoche UTC y, mostrada en hora argentina, cae un día antes. Es el
 * mismo criterio que `formatearFecha` en el frontend.
 */
export function aFechaIso(valor: string): string | null {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor.trim());
  if (!partes) {
    return null;
  }
  const [, d = "", m = "", a = ""] = partes;
  const dia = Number(d);
  const mes = Number(m);
  if (mes < 1 || mes > 12 || dia < 1 || dia > (DIAS_POR_MES[mes - 1] ?? 0)) {
    return null;
  }
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Los once dígitos de un CUIT, o `null`.
 *
 * Se valida el dígito verificador, que es justamente lo que distingue un CUIT
 * bien leído de uno con un dígito cambiado por el OCR. Un CUIT que no verifica
 * no sirve ni para buscar al proveedor ni para cargarlo.
 */
export function cuitLeido(valor: string): string | null {
  const normalizado = normalizarCuit(valor);
  return validarCuit(normalizado) ? normalizado : null;
}

export interface Numeracion {
  puntoVenta: number;
  numero: number;
}

/**
 * Punto de venta y número, vengan en dos campos o pegados.
 *
 * Las facturas de ARCA los imprimen separados ("Punto de Venta: 00002",
 * "Comp. Nro: 00000080"), pero un ticket los junta en uno solo
 * ("Nro. Comprobante: 02715-00574048"). Los ceros a la izquierda son relleno de
 * impresión: las columnas son `integer`.
 */
export function aNumeracion(puntoVenta: string, numero?: string): Numeracion | null {
  if (numero === undefined) {
    const pegado = /^(\d+)-(\d+)$/.exec(puntoVenta.trim());
    return pegado ? aNumeracion(pegado[1] ?? "", pegado[2] ?? "") : null;
  }
  const pv = /^\d+$/.test(puntoVenta.trim()) ? Number(puntoVenta) : null;
  const nro = /^\d+$/.test(numero.trim()) ? Number(numero) : null;
  return pv === null || nro === null ? null : { puntoVenta: pv, numero: nro };
}

// ---------------------------------------------------------------------------
// El contrato con el modelo
// ---------------------------------------------------------------------------

/**
 * Lo que el modelo tiene que devolver: **todo string, y todo obligatorio**.
 *
 * Nada es opcional ni nullable a propósito. Las salidas estructuradas son más
 * confiables cuando el esquema no tiene ramas, y así no hay que distinguir
 * "el modelo omitió el campo" de "el campo no está en el papel": si no está,
 * devuelve `""` y acá se decide qué significa eso según la letra.
 *
 * Los valores van **como están impresos**, sin convertir. La conversión la
 * hacen `aImporte`, `aFechaIso` y compañía, que se pueden probar.
 */
export const comprobanteLeidoSchema = z.object({
  emisorRazonSocial: z.string(),
  emisorCuit: z.string(),
  letra: z.string(),
  puntoVenta: z.string(),
  numero: z.string(),
  /** Cuando el papel los imprime juntos: "02715-00574048". */
  numeroCompleto: z.string(),
  fechaEmision: z.string(),
  concepto: z.string(),
  neto: z.string(),
  iva: z.string(),
  otrosTributos: z.string(),
  total: z.string(),
});

export type ComprobanteLeido = z.infer<typeof comprobanteLeidoSchema>;

const LETRAS = ["A", "B", "C", "E"] as const;

export type Reparo =
  | { campo: string; motivo: "ilegible" }
  | { campo: "total"; motivo: "no_cierra"; esperado: string }
  | { campo: "iva"; motivo: "sin_discriminar" };

export interface CompraPropuesta {
  emisorRazonSocial: string;
  emisorCuit: string | null;
  letra: LetraComprobante | null;
  numeroCompleto: string | null;
  fechaEmision: string | null;
  concepto: string;
  neto: string | null;
  iva: string | null;
  total: string | null;
  /** Lo que una persona tiene que mirar antes de guardar. */
  reparos: Reparo[];
}

/** "0002-00000080", como se escribe un comprobante en Argentina. */
function formatearNumeracion(n: Numeracion): string {
  return `${String(n.puntoVenta).padStart(4, "0")}-${String(n.numero).padStart(8, "0")}`;
}

/**
 * Convierte lo leído en una propuesta para el formulario de compra.
 *
 * No escribe nada ni decide nada definitivo: devuelve los campos que pudo
 * entender y la lista de reparos. Lo que no se entendió queda en `null` para
 * que el formulario lo muestre vacío, nunca relleno con un valor inventado.
 *
 * Es una función pura: la búsqueda del proveedor por CUIT la hace el service,
 * que es el que tiene la base.
 */
export function interpretar(leido: ComprobanteLeido): CompraPropuesta {
  const reparos: Reparo[] = [];
  const faltante = (campo: string) => reparos.push({ campo, motivo: "ilegible" });

  const letra = (LETRAS as readonly string[]).includes(leido.letra.trim().toUpperCase())
    ? (leido.letra.trim().toUpperCase() as LetraComprobante)
    : null;
  if (letra === null) {
    faltante("letra");
  }

  const emisorCuit = leido.emisorCuit.trim() === "" ? null : cuitLeido(leido.emisorCuit);
  if (emisorCuit === null) {
    faltante("emisorCuit");
  }

  // El número puede venir en dos campos o en uno pegado; sirve cualquiera.
  const numeracion =
    aNumeracion(leido.puntoVenta, leido.numero) ?? aNumeracion(leido.numeroCompleto);
  if (numeracion === null) {
    faltante("numeroCompleto");
  }

  const fechaEmision = aFechaIso(leido.fechaEmision);
  if (fechaEmision === null) {
    faltante("fechaEmision");
  }

  const neto = aImporte(leido.neto);
  if (neto === null) {
    faltante("neto");
  }
  const total = aImporte(leido.total);
  if (total === null) {
    faltante("total");
  }

  // Un IVA vacío es normal en una B o una C, donde va incluido en el precio.
  // En una A es un campo que no se pudo leer: la A siempre lo discrimina.
  const ivaVacio = leido.iva.trim() === "";
  const discrimina = letra !== null && discriminaIva(letra);
  let iva = ivaVacio ? "0" : aImporte(leido.iva);
  if (iva === null || (ivaVacio && discrimina)) {
    faltante("iva");
    iva = null;
  }

  const otros = leido.otrosTributos.trim() === "" ? "0" : (aImporte(leido.otrosTributos) ?? "0");

  // El chequeo de que el total cierre vive en `core`, y sólo se puede hacer
  // con los tres números leídos.
  if (letra !== null && neto !== null && iva !== null && total !== null) {
    for (const reparo of revisarTotalesLeidos({
      letra,
      neto: Money.desdeString(neto, "ARS"),
      iva: Money.desdeString(iva, "ARS"),
      otrosTributos: Money.desdeString(otros, "ARS"),
      total: Money.desdeString(total, "ARS"),
    })) {
      reparos.push(
        reparo.tipo === "total_no_cierra"
          ? { campo: "total", motivo: "no_cierra", esperado: reparo.esperado.aStringFiscal() }
          : { campo: "iva", motivo: "sin_discriminar" },
      );
    }
  }

  return {
    emisorRazonSocial: leido.emisorRazonSocial.trim(),
    emisorCuit,
    letra,
    numeroCompleto: numeracion === null ? null : formatearNumeracion(numeracion),
    fechaEmision,
    concepto: leido.concepto.trim(),
    neto,
    iva,
    total,
    reparos,
  };
}

/**
 * Lo que se le pide al modelo.
 *
 * Las tres reglas del final no son teóricas: cada una sale de una factura real
 * que rompía una suposición del código.
 */
export const INSTRUCCIONES = `Sos un lector de comprobantes fiscales argentinos (ARCA, ex AFIP).

Devolvés los datos del comprobante **tal como están impresos**, sin convertir
nada: los importes con su coma decimal y su punto de miles, y las fechas en
dd/mm/aaaa. No calcules, no redondees y no completes lo que no ves.

Si un dato no está en el papel, devolvé la cadena vacía. Nunca lo inventes ni
lo deduzcas de los otros.

Reglas que importan:

1. Si el mismo comprobante aparece varias veces —ORIGINAL, DUPLICADO,
   TRIPLICADO— es UN solo comprobante. Devolvé sus datos una vez. No sumes los
   importes de las copias.
2. En una factura B o C el IVA va incluido en los precios. Si abajo figura un
   "IVA Contenido" por el régimen de transparencia fiscal (ley 27.743), ese
   número es informativo y NO es el IVA discriminado: devolvé el campo iva
   vacío. Sólo la factura A tiene IVA discriminado.
3. El emisor es quien emite la factura, no quien la recibe. Devolvé la razón
   social y el CUIT del emisor, que en un comprobante de ARCA están arriba,
   junto al tipo y al número.
4. La razón social es la que figura en el campo rotulado "Razón Social" o
   "Apellido y Nombre". No uses el logo ni la marca del software que imprimió
   el comprobante, que suelen estar en el mismo lugar.
5. El concepto es la descripción de los bienes o servicios que figura en el
   detalle, no el título del documento ni la palabra "FACTURA". Si hay varias
   líneas, unilas con "; ".`;
