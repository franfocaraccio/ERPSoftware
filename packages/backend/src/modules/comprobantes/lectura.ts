import {
  type AlicuotaIva,
  calcularComprobante,
  discriminaIva,
  type LetraComprobante,
  revisarTotalesLeidos,
} from "@erp/core/invoicing";
import { Money } from "@erp/core/money";
import { normalizarCuit, validarCuit } from "@erp/core/tax";
import { z } from "zod";
import { aFechaIso, aImporte } from "../_comunes/formato-argentino.js";

export { aFechaIso, aImporte };

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
  /** A quién se le emitió. Es lo que identifica al cliente en una venta. */
  receptorRazonSocial: z.string(),
  receptorCuit: z.string(),
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
  /** Vacíos salvo que el comprobante los traiga; una compra no tiene CAE propio. */
  cae: z.string(),
  caeVencimiento: z.string(),
  /**
   * El detalle, línea por línea. En una venta no es opcional: los totales se
   * recalculan de acá, así que el total impreso sirve para contrastar la
   * lectura y no para guardarlo.
   */
  items: z.array(
    z.object({
      descripcion: z.string(),
      cantidad: z.string(),
      precioUnitario: z.string(),
      alicuotaIva: z.string(),
    }),
  ),
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
  let iva = ivaVacio ? "0.00" : aImporte(leido.iva);
  if (iva === null || (ivaVacio && discrimina)) {
    faltante("iva");
    iva = null;
  }

  const otros =
    leido.otrosTributos.trim() === "" ? "0.00" : (aImporte(leido.otrosTributos) ?? "0.00");

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
   líneas, unilas con "; ".
6. El receptor es a quien se le emitió el comprobante: la razón social y el
   CUIT que figuran en el cuerpo, debajo de los datos del emisor. Si el
   receptor es consumidor final y sólo hay un DNI, dejá el CUIT vacío.
7. En "items" va una entrada por línea del detalle, con su descripción,
   cantidad, precio unitario y alícuota de IVA tal como están impresos. La
   alícuota va sólo como número ("21", "10.5") o como "exento" o "no gravado".
   Si el comprobante no discrimina IVA por línea, dejá la alícuota vacía.
8. El CAE y su fecha de vencimiento están al pie, junto al código de barras.
   Si no figuran, dejalos vacíos.`;

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

const ALICUOTAS: readonly AlicuotaIva[] = [
  "0",
  "2.5",
  "5",
  "10.5",
  "21",
  "27",
  "exento",
  "no_gravado",
];

/**
 * "21 %" → "21"; "Exento" → "exento".
 *
 * Una alícuota no es un importe libre: es una de las ocho que acepta ARCA. Lo
 * que no cae en esa lista vuelve null y queda como un campo a completar.
 */
export function aAlicuota(valor: string): AlicuotaIva | null {
  const limpio = valor.trim().toLowerCase().replace("%", "").replace(",", ".").trim();
  if (limpio === "") {
    return null;
  }
  if (limpio.startsWith("exento")) {
    return "exento";
  }
  if (limpio.startsWith("no gravado") || limpio.startsWith("no_gravado")) {
    return "no_gravado";
  }
  // "21.00" y "21" son la misma alícuota; el papel imprime cualquiera de las dos.
  const normalizado = String(Number(limpio));
  return (ALICUOTAS as readonly string[]).includes(normalizado)
    ? (normalizado as AlicuotaIva)
    : null;
}

export interface ItemLeido {
  descripcion: string;
  cantidad: string | null;
  precioUnitario: string | null;
  alicuotaIva: AlicuotaIva | null;
}

export interface VentaPropuesta {
  receptorRazonSocial: string;
  receptorCuit: string | null;
  clase: "factura" | "nota_credito" | "nota_debito";
  /** Lo que dice el papel. La que vale la calcula el sistema por el cliente. */
  letraLeida: LetraComprobante | null;
  puntoVenta: number | null;
  numero: number | null;
  fechaEmision: string | null;
  cae: string | null;
  caeVencimiento: string | null;
  items: ItemLeido[];
  /** El total impreso, sólo para contrastar: no se guarda. */
  totalImpreso: string | null;
  reparos: Reparo[];
}

/**
 * Qué alícuota corresponde cuando el comprobante no la imprime por ítem.
 *
 * En una **C** no hay IVA: el emisor es monotributista o exento, el precio es
 * el precio, y la alícuota es cero. Eso hace que el total calculado dé igual
 * al impreso, que es lo que se quiere.
 *
 * En una **B** el IVA existe pero va adentro del precio, y de ahí no se puede
 * deducir la tasa: un precio de 7.963 puede llevar 21% o 10,5% adentro. Queda
 * en `null` para que lo complete una persona, que es lo honesto; poner 0
 * guardaría todo como neto e inflaría las ventas.
 */
function alicuotaPorLetra(letra: LetraComprobante | null): AlicuotaIva | null {
  return letra === "C" ? "0" : null;
}

/** "NOTA DE CRÉDITO" → nota_credito. Lo que no se reconoce es una factura. */
function aClase(texto: string): "factura" | "nota_credito" | "nota_debito" {
  const t = texto.toLowerCase();
  if (t.includes("crédito") || t.includes("credito")) {
    return "nota_credito";
  }
  if (t.includes("débito") || t.includes("debito")) {
    return "nota_debito";
  }
  return "factura";
}

/**
 * Convierte lo leído en una propuesta para el formulario de venta.
 *
 * La diferencia con una compra no es cosmética. Una compra es un papel ajeno y
 * sus totales se transcriben; una venta la emite el sistema, así que los
 * totales **se recalculan de los ítems** con la misma función que usa el
 * backend. El total impreso no se guarda: se compara contra el calculado, y si
 * no coinciden es que algún ítem se leyó mal. Esa comparación es la que valida
 * la lectura entera.
 */
export function interpretarVenta(leido: ComprobanteLeido): VentaPropuesta {
  const reparos: Reparo[] = [];
  const faltante = (campo: string) => reparos.push({ campo, motivo: "ilegible" });

  const receptorCuit = leido.receptorCuit.trim() === "" ? null : cuitLeido(leido.receptorCuit);
  if (receptorCuit === null) {
    faltante("receptorCuit");
  }

  const numeracion =
    aNumeracion(leido.puntoVenta, leido.numero) ?? aNumeracion(leido.numeroCompleto);
  if (numeracion === null) {
    faltante("numeroCompleto");
  }

  const fechaEmision = aFechaIso(leido.fechaEmision);
  if (fechaEmision === null) {
    faltante("fechaEmision");
  }

  const letraLeida = (LETRAS as readonly string[]).includes(leido.letra.trim().toUpperCase())
    ? (leido.letra.trim().toUpperCase() as LetraComprobante)
    : null;

  const items: ItemLeido[] = leido.items.map((i) => ({
    descripcion: i.descripcion.trim(),
    cantidad: aImporte(i.cantidad),
    precioUnitario: aImporte(i.precioUnitario),
    alicuotaIva: aAlicuota(i.alicuotaIva) ?? alicuotaPorLetra(letraLeida),
  }));

  if (items.length === 0) {
    faltante("items");
  }
  items.forEach((item, i) => {
    if (item.descripcion === "" || item.cantidad === null || item.precioUnitario === null) {
      faltante(`items.${i}`);
    }
  });

  const totalImpreso = aImporte(leido.total);

  // El contraste: si los ítems leídos no dan el total impreso, algo se leyó
  // mal, y conviene decir cuánto da la cuenta para que se vea dónde.
  const completos = items.every(
    (i) => i.cantidad !== null && i.precioUnitario !== null && i.alicuotaIva !== null,
  );
  if (completos && items.length > 0 && totalImpreso !== null) {
    const calculado = calcularComprobante(
      items.map((i) => ({
        cantidad: i.cantidad ?? "0",
        precioUnitario: i.precioUnitario ?? "0",
        alicuotaIva: i.alicuotaIva ?? "21",
      })),
      "ARS",
    );
    if (
      calculado.total.aStringFiscal() !== Money.desdeString(totalImpreso, "ARS").aStringFiscal()
    ) {
      reparos.push({
        campo: "total",
        motivo: "no_cierra",
        esperado: calculado.total.aStringFiscal(),
      });
    }
  }

  return {
    receptorRazonSocial: leido.receptorRazonSocial.trim(),
    receptorCuit,
    clase: aClase(`${leido.letra} ${leido.concepto}`),
    letraLeida,
    puntoVenta: numeracion?.puntoVenta ?? null,
    numero: numeracion?.numero ?? null,
    fechaEmision,
    cae: leido.cae.trim() === "" ? null : leido.cae.trim(),
    caeVencimiento: leido.caeVencimiento.trim() === "" ? null : aFechaIso(leido.caeVencimiento),
    items,
    totalImpreso,
    reparos,
  };
}
