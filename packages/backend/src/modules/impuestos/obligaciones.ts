import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import {
  determinadoImpuesto,
  type EstadoImpuesto,
  estadoImpuesto,
  type PosicionMes,
  posicionMensual,
  saldoImpuesto,
} from "@erp/core/tax";
import { eq, sql } from "drizzle-orm";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { impuestos, retencionesIibb } from "../../db/schema/impuestos.js";
import type { TenantTx } from "../../db/tenant-db.js";
import { conSigno, ventasQueCuentan } from "../_comunes/comprobantes.js";
import { leerParametros } from "../parametros/service.js";

const ARS = "ARS" as const;
const ars = (v: string | null | undefined) => Money.desdeString(v ?? "0", ARS);
const aMoneyONull = (v: string | null) => (v === null ? null : Money.desdeString(v, ARS));

type Tipo = (typeof impuestos.tipo.enumValues)[number];

/**
 * Una obligación impositiva: una fila cargada a mano o una posición de IVA que
 * calcula el sistema. Es lo que leen la pantalla de Impuestos, el KPI de
 * vencidos y la proyección de caja, para que los tres digan lo mismo.
 */
export interface Obligacion {
  /** El id de la fila, o `iva:YYYY-MM` para una posición sin pago registrado. */
  id: string;
  /** La fila que la respalda, si existe. */
  impuestoId: string | null;
  tipo: Tipo;
  /** Primer día del mes: `YYYY-MM-01`. */
  periodo: string;
  concepto: string | null;
  /**
   * manual: cargada por una persona. calculado: posición de IVA del sistema.
   * historico: un IVA cargado a mano antes de que se calculara; manda en su
   * período para no contarlo dos veces.
   */
  origen: "manual" | "calculado" | "historico";
  baseImponible: string | null;
  alicuota: string | null;
  importeFijo: string | null;
  /** Lo que generó el impuesto antes de créditos (débito fiscal, IIBB bruto). */
  bruto: string;
  /** Lo que lo redujo: crédito fiscal, saldo a favor, retenciones. */
  creditos: string;
  importeDeterminado: string;
  importePagado: string;
  saldo: string;
  estado: EstadoImpuesto;
  fechaVencimiento: string;
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** `YYYY-MM` → vencimiento el día `dia` del mes siguiente. */
function vencimientoIva(periodo: string, dia: number): string {
  const [anio, mes] = periodo.split("-").map(Number) as [number, number];
  const siguiente = mes === 12 ? { a: anio + 1, m: 1 } : { a: anio, m: mes + 1 };
  const d = Math.min(Math.max(dia, 1), 28);
  return `${siguiente.a}-${String(siguiente.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Los meses de `desde` a `hasta`, inclusive, como `YYYY-MM`. */
function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.split("-").map(Number) as [number, number];
  const [ha, hm] = hasta.split("-").map(Number) as [number, number];
  while (a < ha || (a === ha && m <= hm)) {
    meses.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

export interface MesIva extends PosicionMes {
  debito: Money;
}

/**
 * Posición de IVA mes a mes, desde el primer comprobante hasta el mes en
 * curso: débito fiscal de ventas (las notas de crédito restan) menos crédito
 * fiscal de compras, arrastrando el saldo a favor.
 *
 * Las ventas cuentan por fecha de emisión; las compras, por fecha de
 * recepción, que es cuando el crédito fiscal se registra. Sólo en pesos y
 * sólo comprobantes que son deuda real.
 */
export async function posicionIva(tx: TenantTx): Promise<PosicionMes[]> {
  const debitos = await tx
    .select({
      mes: sql<string>`to_char(${comprobantesVenta.fechaEmision}, 'YYYY-MM')`,
      total: sql<string>`sum(${conSigno(comprobantesVenta.iva)})`,
    })
    .from(comprobantesVenta)
    .where(ventasQueCuentan())
    .groupBy(sql`1`);
  const creditos = await tx
    .select({
      mes: sql<string>`to_char(${comprobantesCompra.fechaRecepcion}, 'YYYY-MM')`,
      total: sql<string>`sum(${comprobantesCompra.iva})`,
    })
    .from(comprobantesCompra)
    .where(eq(comprobantesCompra.moneda, ARS))
    .groupBy(sql`1`);

  const todos = [...debitos, ...creditos].map((f) => f.mes).sort();
  const primero = todos[0];
  if (!primero) {
    return [];
  }
  const debito = new Map(debitos.map((d) => [d.mes, ars(d.total)]));
  const credito = new Map(creditos.map((c) => [c.mes, ars(c.total)]));
  const hasta = mesDe(hoyEnArgentina());

  return posicionMensual(
    mesesEntre(primero, hasta > primero ? hasta : primero).map((mes) => ({
      periodo: mes,
      // Un mes con más notas de crédito que facturas tiene débito negativo:
      // es crédito, no un débito menor a cero.
      cargo: (debito.get(mes) ?? Money.cero(ARS)).esNegativo()
        ? Money.cero(ARS)
        : (debito.get(mes) ?? Money.cero(ARS)),
      credito: (credito.get(mes) ?? Money.cero(ARS)).sumar(
        (debito.get(mes) ?? Money.cero(ARS)).esNegativo()
          ? (debito.get(mes) ?? Money.cero(ARS)).negar()
          : Money.cero(ARS),
      ),
    })),
  );
}

export interface RetencionesPorMes {
  porMes: Map<string, Money>;
}

async function retencionesPorMes(tx: TenantTx): Promise<Map<string, Money>> {
  const filas = await tx
    .select({
      mes: sql<string>`to_char(${retencionesIibb.periodo}, 'YYYY-MM')`,
      total: sql<string>`sum(${retencionesIibb.importe})`,
    })
    .from(retencionesIibb)
    .groupBy(sql`1`);
  return new Map(filas.map((f) => [f.mes, ars(f.total)]));
}

/**
 * Todas las obligaciones de la empresa, con lo determinado ya calculado.
 *
 * - IIBB: base × alícuota menos las retenciones, percepciones y SIRCREB del
 *   período y el saldo a favor del anterior (`posicionMensual`, en core).
 * - IVA, para Responsables Inscriptos: la posición calculada. Un mes que ya
 *   tiene un IVA cargado a mano lo conserva como histórico y no se calcula.
 * - El resto: importe fijo o base × alícuota, como se cargó.
 */
export async function obligacionesImpositivas(
  tx: TenantTx,
  tenantId: string,
): Promise<Obligacion[]> {
  const hoy = hoyEnArgentina();
  const { regimenFiscal, diaVencimientoIva } = await leerParametros(tx, tenantId);
  const filas = await tx.select().from(impuestos);

  const bruto = (f: (typeof filas)[number]) =>
    determinadoImpuesto({
      importeFijo: aMoneyONull(f.importeFijo),
      base: aMoneyONull(f.baseImponible),
      alicuota: f.alicuota,
    });

  const armar = (
    f: (typeof filas)[number] | null,
    datos: Pick<Obligacion, "id" | "tipo" | "periodo" | "origen" | "fechaVencimiento"> & {
      bruto: Money;
      creditos: Money;
      pagado: Money;
    },
  ): Obligacion => {
    const determinado = datos.bruto.restar(datos.creditos);
    return {
      id: datos.id,
      impuestoId: f?.id ?? null,
      tipo: datos.tipo,
      periodo: datos.periodo,
      concepto: f?.concepto ?? null,
      origen: datos.origen,
      baseImponible: f?.baseImponible ?? null,
      alicuota: f?.alicuota ?? null,
      importeFijo: f?.importeFijo ?? null,
      bruto: datos.bruto.aStringFiscal(),
      creditos: datos.creditos.aStringFiscal(),
      importeDeterminado: determinado.aStringFiscal(),
      importePagado: datos.pagado.aStringFiscal(),
      saldo: saldoImpuesto(determinado, datos.pagado).aStringFiscal(),
      estado: estadoImpuesto(determinado, datos.pagado, datos.fechaVencimiento, hoy),
      fechaVencimiento: datos.fechaVencimiento,
    };
  };

  const obligaciones: Obligacion[] = [];

  // --- IIBB: neto de retenciones, arrastrando el saldo a favor ---
  const iibb = filas.filter((f) => f.tipo === "iibb");
  const retenciones = await retencionesPorMes(tx);
  const brutoIibbPorMes = new Map<string, Money>();
  for (const f of iibb) {
    const mes = mesDe(f.periodo);
    brutoIibbPorMes.set(mes, (brutoIibbPorMes.get(mes) ?? Money.cero(ARS)).sumar(bruto(f)));
  }
  const posIibb = posicionMensual(
    [...new Set([...brutoIibbPorMes.keys(), ...retenciones.keys()])].map((mes) => ({
      periodo: mes,
      cargo: brutoIibbPorMes.get(mes) ?? Money.cero(ARS),
      credito: retenciones.get(mes) ?? Money.cero(ARS),
    })),
  );
  const creditoIibb = new Map(posIibb.map((p) => [p.periodo, p.cargo.restar(p.aPagar)]));
  // El crédito de un mes se reparte entre sus filas en orden, sin pasarse del
  // bruto de cada una.
  for (const f of [...iibb].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const mes = mesDe(f.periodo);
    const disponible = creditoIibb.get(mes) ?? Money.cero(ARS);
    const propio = bruto(f);
    const aplicado = disponible.mayorQue(propio) ? propio : disponible;
    creditoIibb.set(mes, disponible.restar(aplicado));
    obligaciones.push(
      armar(f, {
        id: f.id,
        tipo: "iibb",
        periodo: f.periodo,
        origen: "manual",
        fechaVencimiento: f.fechaVencimiento,
        bruto: propio,
        creditos: aplicado,
        pagado: ars(f.importePagado),
      }),
    );
  }

  // --- IVA ---
  const ivaManual = filas.filter((f) => f.tipo === "iva" && !f.calculado);
  const ivaPagos = filas.filter((f) => f.tipo === "iva" && f.calculado);
  const mesesHistoricos = new Set(ivaManual.map((f) => mesDe(f.periodo)));
  for (const f of ivaManual) {
    obligaciones.push(
      armar(f, {
        id: f.id,
        tipo: "iva",
        periodo: f.periodo,
        origen: "historico",
        fechaVencimiento: f.fechaVencimiento,
        bruto: bruto(f),
        creditos: Money.cero(ARS),
        pagado: ars(f.importePagado),
      }),
    );
  }
  if (regimenFiscal === "responsable_inscripto") {
    const pagosPorMes = new Map<string, (typeof ivaPagos)[number][]>();
    for (const p of ivaPagos) {
      const mes = mesDe(p.periodo);
      pagosPorMes.set(mes, [...(pagosPorMes.get(mes) ?? []), p]);
    }
    for (const pos of await posicionIva(tx)) {
      if (mesesHistoricos.has(pos.periodo)) {
        continue;
      }
      const pagos = pagosPorMes.get(pos.periodo) ?? [];
      if (!pos.aPagar.esPositivo() && pagos.length === 0) {
        continue;
      }
      const fila = pagos.at(-1) ?? null;
      obligaciones.push(
        armar(fila, {
          id: fila?.id ?? `iva:${pos.periodo}`,
          tipo: "iva",
          periodo: `${pos.periodo}-01`,
          origen: "calculado",
          fechaVencimiento:
            fila?.fechaVencimiento ?? vencimientoIva(pos.periodo, diaVencimientoIva),
          bruto: pos.cargo,
          creditos: pos.cargo.restar(pos.aPagar),
          pagado: Money.sumarTodos(
            pagos.map((p) => ars(p.importePagado)),
            ARS,
          ),
        }),
      );
    }
  }

  // --- El resto, tal como se cargó ---
  for (const f of filas.filter((f) => f.tipo !== "iibb" && f.tipo !== "iva")) {
    obligaciones.push(
      armar(f, {
        id: f.id,
        tipo: f.tipo,
        periodo: f.periodo,
        origen: "manual",
        fechaVencimiento: f.fechaVencimiento,
        bruto: bruto(f),
        creditos: Money.cero(ARS),
        pagado: ars(f.importePagado),
      }),
    );
  }

  return obligaciones;
}
