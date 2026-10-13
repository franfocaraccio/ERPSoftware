import { Money } from "@erp/core/money";
import { variacion } from "@erp/core/resultados";
import PDFDocument from "pdfkit";
import { formatearPesos } from "../explicacion/hechos.js";
import type { InformeMensual } from "./datos.js";

/**
 * El informe ejecutivo mensual en PDF, listo para el dueño.
 *
 * Sólo dibuja: los números llegan calculados (`armarInforme`) y las
 * variaciones las calcula `@erp/core`. Los importes se formatean desde el
 * string, sin pasar por `number`.
 *
 * Usa las tipografías estándar del PDF (Helvetica), que no hace falta
 * embeber. Su juego de caracteres cubre el castellano, pero no el signo menos
 * tipográfico (−): se reemplaza por un guion.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const COLOR = {
  texto: "#1d2421",
  suave: "#5d6763",
  linea: "#dde2df",
  fondo: "#f2f5f3",
  acento: "#1f6b5c",
  bien: "#1c6a43",
  mal: "#a23b2a",
};

const MARGEN = 48;
const ANCHO_A4 = 595.28;
const ALTO_A4 = 841.89;
const ANCHO = ANCHO_A4 - MARGEN * 2;

export function nombreDelMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  return `${MESES[m - 1] ?? ""} de ${a}`;
}

function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const pesos = (v: string) => formatearPesos(v).replace("−", "-");

function porcentaje(v: string | null): string {
  return v === null ? "-" : `${v.replace(".", ",")} %`;
}

function conSigno(v: string | null): string {
  if (v === null) {
    return "-";
  }
  return `${v.startsWith("-") ? "" : "+"}${v.replace(".", ",")} %`;
}

function variacionDe(actual: string, anterior: string | undefined): string | null {
  if (anterior === undefined) {
    return null;
  }
  return variacion(Money.desdeString(actual, "ARS"), Money.desdeString(anterior, "ARS")).porcentaje;
}

const ETIQUETA_IMPUESTO: Record<string, string> = {
  iva: "IVA",
  iibb: "IIBB",
  ganancias: "Ganancias",
  monotributo: "Monotributo",
  otros: "Otros",
};

function valorKpi(k: InformeMensual["kpis"][number]): string {
  if (k.valor === null) {
    return "Sin datos";
  }
  switch (k.unidad) {
    case "moneda":
      return pesos(k.valor);
    case "dias":
      return `${k.valor} días`;
    case "porcentaje":
      return porcentaje(k.valor);
    case "ratio":
      return k.valor.replace(".", ",");
    default:
      return k.valor;
  }
}

function estadoKpi(k: InformeMensual["kpis"][number]): string {
  if (k.valor === null) {
    return "Sin datos";
  }
  return k.semaforo === "ok" ? "En rango" : k.semaforo === "alerta" ? "Atención" : "Sin umbral";
}

interface Columna {
  titulo: string;
  ancho: number;
  derecha?: boolean;
}

class Dibujo {
  constructor(readonly doc: PDFKit.PDFDocument) {}

  /** Si no entra lo que sigue, página nueva. */
  espacio(alto: number): void {
    if (this.doc.y + alto > ALTO_A4 - MARGEN - 24) {
      this.doc.addPage();
    }
  }

  seccion(titulo: string, bajada?: string): void {
    this.espacio(70);
    const { doc } = this;
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR.texto).text(titulo, MARGEN, doc.y);
    if (bajada) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR.suave)
        .text(bajada, MARGEN, doc.y + 2);
    }
    doc.moveDown(0.5);
  }

  tarjetas(
    items: { titulo: string; valor: string; detalle: string; tono?: "bien" | "mal" }[],
  ): void {
    const { doc } = this;
    const gap = 10;
    const ancho = (ANCHO - gap * (items.length - 1)) / items.length;
    const interior = ancho - 24;
    // Todas las tarjetas de la fila con el mismo alto: el de la que más texto
    // tiene. Así un título largo baja el número en vez de pisarlo.
    const medidas = items.map((it) => {
      doc.font("Helvetica").fontSize(8);
      const titulo = doc.heightOfString(it.titulo.toUpperCase(), {
        width: interior,
        characterSpacing: 0.4,
      });
      doc.font("Helvetica-Bold").fontSize(15);
      const valor = doc.heightOfString(it.valor, { width: interior });
      doc.font("Helvetica").fontSize(8.5);
      const detalle = doc.heightOfString(it.detalle, { width: interior });
      return { titulo, valor, detalle };
    });
    const tituloMax = Math.max(...medidas.map((m) => m.titulo));
    const valorMax = Math.max(...medidas.map((m) => m.valor));
    const detalleMax = Math.max(...medidas.map((m) => m.detalle));
    const alto = 11 + tituloMax + 5 + valorMax + 5 + detalleMax + 11;
    this.espacio(alto + 10);
    const y = doc.y;
    items.forEach((it, i) => {
      const x = MARGEN + i * (ancho + gap);
      doc.roundedRect(x, y, ancho, alto, 6).fillColor(COLOR.fondo).fill();
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLOR.suave)
        .text(it.titulo.toUpperCase(), x + 12, y + 11, { width: interior, characterSpacing: 0.4 });
      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor(COLOR.texto)
        .text(it.valor, x + 12, y + 11 + tituloMax + 5, { width: interior });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(it.tono ? COLOR[it.tono] : COLOR.suave)
        .text(it.detalle, x + 12, y + 11 + tituloMax + 5 + valorMax + 5, { width: interior });
    });
    doc.x = MARGEN;
    doc.y = y + alto + 10;
  }

  recuadro(titulo: string, texto: string): void {
    const { doc } = this;
    doc.font("Helvetica").fontSize(10);
    const alto = doc.heightOfString(texto, { width: ANCHO - 28, lineGap: 2 }) + 34;
    this.espacio(alto + 10);
    const y = doc.y;
    doc.roundedRect(MARGEN, y, ANCHO, alto, 6).fillColor(COLOR.fondo).fill();
    doc.rect(MARGEN, y, 3, alto).fillColor(COLOR.acento).fill();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR.acento)
      .text(titulo, MARGEN + 14, y + 10, { width: ANCHO - 28 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOR.texto)
      .text(texto, MARGEN + 14, y + 24, { width: ANCHO - 28, lineGap: 2 });
    doc.x = MARGEN;
    doc.y = y + alto + 6;
  }

  tabla(columnas: Columna[], filas: string[][], destacar: Set<number> = new Set()): void {
    const { doc } = this;
    const escala = ANCHO / columnas.reduce((t, c) => t + c.ancho, 0);
    const anchos = columnas.map((c) => c.ancho * escala);
    const fila = (celdas: string[], negrita: boolean, encabezado: boolean) => {
      doc
        .font(negrita || encabezado ? "Helvetica-Bold" : "Helvetica")
        .fontSize(encabezado ? 7.5 : 9);
      const alto =
        Math.max(...celdas.map((c, i) => doc.heightOfString(c, { width: (anchos[i] ?? 0) - 10 }))) +
        9;
      this.espacio(alto);
      const y = doc.y;
      let x = MARGEN;
      celdas.forEach((c, i) => {
        const ancho = anchos[i] ?? 0;
        doc
          .fillColor(encabezado ? COLOR.suave : COLOR.texto)
          .text(encabezado ? c.toUpperCase() : c, x + 5, y + 5, {
            width: ancho - 10,
            align: columnas[i]?.derecha ? "right" : "left",
          });
        x += ancho;
      });
      doc
        .moveTo(MARGEN, y + alto)
        .lineTo(MARGEN + ANCHO, y + alto)
        .lineWidth(0.5)
        .strokeColor(COLOR.linea)
        .stroke();
      doc.x = MARGEN;
      doc.y = y + alto;
    };
    fila(
      columnas.map((c) => c.titulo),
      false,
      true,
    );
    filas.forEach((celdas, i) => {
      fila(celdas, destacar.has(i), false);
    });
  }

  nota(texto: string): void {
    const { doc } = this;
    this.espacio(20);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLOR.suave)
      .text(texto, MARGEN, doc.y + 4, { width: ANCHO });
  }
}

export function dibujarInforme(informe: InformeMensual): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: {
      Title: `Informe mensual ${nombreDelMes(informe.periodo)} - ${informe.empresa}`,
      Author: informe.empresa,
    },
  });
  const partes: Buffer[] = [];
  doc.on("data", (b: Buffer) => partes.push(b));
  const listo = new Promise<Buffer>((resolver, rechazar) => {
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rechazar);
  });

  const d = new Dibujo(doc);
  const { actual, anterior } = informe;

  // --- Encabezado ---
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLOR.acento)
    .text(`INFORME MENSUAL · ${informe.empresa.toUpperCase()}`, MARGEN, MARGEN, {
      characterSpacing: 0.6,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(COLOR.texto)
    .text(
      nombreDelMes(informe.periodo).replace(/^./, (c) => c.toUpperCase()),
      MARGEN,
      doc.y + 4,
    );
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR.suave)
    .text(
      `Comparado con ${nombreDelMes(informe.periodoAnterior)}. Generado el ${fecha(informe.generado)}.`,
      MARGEN,
      doc.y + 2,
    );
  doc.moveDown(1.2);

  // --- Resumen ---
  const tono = (v: string | null) => (v === null ? undefined : v.startsWith("-") ? "mal" : "bien");
  d.tarjetas([
    {
      titulo: "Ventas netas",
      valor: pesos(actual.ventas),
      detalle: `${conSigno(informe.variaciones.ventas)} contra el mes anterior`,
      ...(tono(informe.variaciones.ventas) ? { tono: tono(informe.variaciones.ventas) } : {}),
    },
    {
      titulo: "Margen bruto",
      valor: pesos(actual.margenBruto),
      detalle: `${porcentaje(actual.margenPorcentual)} de las ventas${anterior ? ` (antes ${porcentaje(anterior.margenPorcentual)})` : ""}`,
    },
    {
      titulo: "Resultado neto",
      valor: pesos(actual.resultadoNeto),
      detalle: `${conSigno(informe.variaciones.resultadoNeto)} contra el mes anterior`,
      tono: actual.resultadoNeto.startsWith("-") ? "mal" : "bien",
    },
  ] as Parameters<Dibujo["tarjetas"]>[0]);

  if (informe.lectura) {
    d.recuadro("LECTURA DEL MES", informe.lectura);
  }

  // --- Estado de resultados ---
  d.seccion(
    "Estado de resultados",
    "Devengado: ventas y compras por la fecha del comprobante, sin IVA. Antes de Ganancias.",
  );
  const filasER: {
    concepto: string;
    actual: string;
    anterior: string | undefined;
    total?: boolean;
  }[] = [
    { concepto: "Ventas netas", actual: actual.ventas, anterior: anterior?.ventas },
    { concepto: "- Costo de ventas", actual: actual.costoVentas, anterior: anterior?.costoVentas },
    {
      concepto: "Margen bruto",
      actual: actual.margenBruto,
      anterior: anterior?.margenBruto,
      total: true,
    },
    ...actual.gastos.map((g) => ({
      concepto: `- ${g.categoria}`,
      actual: g.importe,
      anterior: anterior
        ? (anterior.gastos.find((x) => x.categoria === g.categoria)?.importe ?? "0.00")
        : undefined,
    })),
    {
      concepto: "- Impuestos sobre ventas (IIBB)",
      actual: actual.impuestosSobreVentas,
      anterior: anterior?.impuestosSobreVentas,
    },
    {
      concepto: "Resultado operativo",
      actual: actual.resultadoOperativo,
      anterior: anterior?.resultadoOperativo,
      total: true,
    },
    { concepto: "Otros ingresos", actual: actual.otrosIngresos, anterior: anterior?.otrosIngresos },
    {
      concepto: "Resultado neto",
      actual: actual.resultadoNeto,
      anterior: anterior?.resultadoNeto,
      total: true,
    },
  ];
  d.tabla(
    [
      { titulo: "Concepto", ancho: 4 },
      { titulo: nombreDelMes(informe.periodoAnterior), ancho: 2.2, derecha: true },
      { titulo: nombreDelMes(informe.periodo), ancho: 2.2, derecha: true },
      { titulo: "Variación", ancho: 1.4, derecha: true },
    ],
    filasER.map((f) => [
      f.concepto,
      f.anterior === undefined ? "-" : pesos(f.anterior),
      pesos(f.actual),
      conSigno(variacionDe(f.actual, f.anterior)),
    ]),
    new Set(filasER.flatMap((f, i) => (f.total ? [i] : []))),
  );

  // --- Caja ---
  d.seccion(
    `Caja al ${fecha(informe.generado)}`,
    "La foto de hoy y la proyección de las próximas 13 semanas.",
  );
  const { caja } = informe;
  d.tarjetas([
    {
      titulo: "Saldo en cuentas",
      valor: pesos(caja.consolidado),
      detalle: "Todas las cuentas, en pesos",
    },
    {
      titulo: "Saldo proyectado más bajo",
      valor: caja.saldoMasBajo ? pesos(caja.saldoMasBajo.saldoFinal) : "-",
      detalle: caja.saldoMasBajo
        ? `Semana del ${fecha(caja.saldoMasBajo.inicio)}`
        : "Sin proyección",
      ...(caja.saldoMasBajo?.saldoFinal.startsWith("-") ? { tono: "mal" as const } : {}),
    },
    {
      titulo: "Mínimo operativo",
      valor: caja.minimoOperativo ? pesos(caja.minimoOperativo) : "Sin definir",
      detalle: caja.primeraBajoMinimo
        ? `Se perfora la semana del ${fecha(caja.primeraBajoMinimo.inicio)}`
        : "No se perfora en 13 semanas",
      ...(caja.primeraBajoMinimo ? { tono: "mal" as const } : { tono: "bien" as const }),
    },
  ]);
  if (caja.primeraNegativa) {
    d.nota(
      `Atención: la semana del ${fecha(caja.primeraNegativa.inicio)} la caja proyectada queda en negativo.`,
    );
  }
  d.nota(
    `Pagos vencidos incluidos en la semana en curso: ${pesos(caja.pagosVencidos)}. Cobros vencidos que no se proyectan: ${pesos(caja.cobrosVencidos)}.`,
  );

  // --- Indicadores ---
  d.seccion("Indicadores", `Calculados al ${fecha(informe.generado)}, sobre los últimos 30 días.`);
  d.tabla(
    [
      { titulo: "Indicador", ancho: 3 },
      { titulo: "Valor", ancho: 1.6, derecha: true },
      { titulo: "Estado", ancho: 1.4, derecha: true },
    ],
    informe.kpis.map((k) => [k.etiqueta, valorKpi(k), estadoKpi(k)]),
  );

  // --- Deudas ---
  d.seccion("Quién te debe", `Total a cobrar: ${pesos(informe.totalACobrar)}.`);
  if (informe.deudores.length > 0) {
    d.tabla(
      [
        { titulo: "Cliente", ancho: 3.4 },
        { titulo: "Saldo", ancho: 1.8, derecha: true },
        { titulo: "Vencimiento", ancho: 1.6, derecha: true },
      ],
      informe.deudores.map((c) => [
        c.enMora ? `${c.nombre} (en mora)` : c.nombre,
        pesos(c.saldo),
        c.vencimiento ? fecha(c.vencimiento) : "-",
      ]),
    );
  } else {
    d.nota("Nadie tiene saldo pendiente.");
  }

  d.seccion("A quién le debés", `Total a pagar: ${pesos(informe.totalAPagar)}.`);
  if (informe.acreedores.length > 0) {
    d.tabla(
      [
        { titulo: "Proveedor", ancho: 3.4 },
        { titulo: "Saldo", ancho: 1.8, derecha: true },
        { titulo: "Vencimiento", ancho: 1.6, derecha: true },
      ],
      informe.acreedores.map((p) => [
        p.nombre,
        pesos(p.saldo),
        p.vencimiento ? fecha(p.vencimiento) : "-",
      ]),
    );
  } else {
    d.nota("No hay deudas con proveedores.");
  }

  d.seccion("Impuestos pendientes", `Total adeudado: ${pesos(informe.totalImpuestos)}.`);
  if (informe.impuestosPendientes.length > 0) {
    d.tabla(
      [
        { titulo: "Impuesto", ancho: 2.6 },
        { titulo: "Período", ancho: 1.6 },
        { titulo: "Saldo", ancho: 1.7, derecha: true },
        { titulo: "Vence", ancho: 1.5, derecha: true },
      ],
      informe.impuestosPendientes.map((i) => [
        `${ETIQUETA_IMPUESTO[i.tipo] ?? i.tipo}${i.concepto ? ` · ${i.concepto}` : ""}`,
        nombreDelMes(i.periodo.slice(0, 7)),
        pesos(i.saldo),
        `${fecha(i.vencimiento)}${i.vencido ? " (vencido)" : ""}`,
      ]),
    );
  } else {
    d.nota("No hay impuestos impagos.");
  }

  // --- Rentabilidad ---
  d.seccion("Lo que más dejó en el mes", "Margen bruto en pesos, de mayor a menor.");
  const tablaRentabilidad = (titulo: string, filas: InformeMensual["mejoresClientes"]) => {
    if (filas.length === 0) {
      d.nota(`Sin ventas por ${titulo.toLowerCase()} en el mes.`);
      return;
    }
    d.tabla(
      [
        { titulo, ancho: 3.6 },
        { titulo: "Ventas netas", ancho: 1.8, derecha: true },
        { titulo: "Margen", ancho: 1.2, derecha: true },
      ],
      filas.map((f) => [f.nombre, pesos(f.ventas), porcentaje(f.margenPorcentual)]),
    );
    doc.moveDown(0.6);
  };
  tablaRentabilidad("Cliente", informe.mejoresClientes);
  tablaRentabilidad("Producto", informe.mejoresProductos);

  if (informe.reposicion.productos > 0) {
    d.nota(
      `Para reponer: ${informe.reposicion.productos} producto${informe.reposicion.productos === 1 ? "" : "s"} bajo el mínimo${informe.reposicion.total ? `, unos ${pesos(informe.reposicion.total)} al costo de la última compra` : ""}. El detalle por proveedor está en Stock.`,
    );
  }

  // --- Pie de página ---
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // El pie va debajo del margen inferior: sin esto pdfkit lo toma como
    // desborde y agrega una página en blanco.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLOR.suave)
      .text(
        `${informe.empresa} · ${nombreDelMes(informe.periodo)} · página ${i - start + 1} de ${count}`,
        MARGEN,
        ALTO_A4 - MARGEN + 12,
        { width: ANCHO, align: "center", lineBreak: false },
      );
  }

  doc.end();
  return listo;
}
