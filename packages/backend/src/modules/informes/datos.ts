import { Money } from "@erp/core/money";
import { variacion } from "@erp/core/resultados";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organization } from "../../db/schema/auth.js";
import type { Context } from "../../trpc/context.js";
import { appRouter } from "../../trpc/router.js";
import { createCallerFactory } from "../../trpc/trpc.js";
import type { Kpi } from "../financiero/service.js";
import type { FilaResultados } from "../resultados/service.js";

/**
 * Los datos del informe ejecutivo mensual.
 *
 * Todo sale de los mismos procedures que usan las pantallas, a través de un
 * caller de tRPC con la sesión de quien descarga: el informe no puede mostrar
 * nada que esa persona no vea en la app. Las cuentas las hizo `@erp/core`; acá
 * sólo se elige qué mostrar y se ordena.
 */

const crearCaller = createCallerFactory(appRouter);

const ars = (v: string) => Money.desdeString(v, "ARS");

/** Cuántas filas entran en cada lista del informe: es un resumen, no un listado. */
const FILAS = 5;

export interface InformeMensual {
  empresa: string;
  /** `YYYY-MM`. */
  periodo: string;
  periodoAnterior: string;
  /** `YYYY-MM-DD`: la foto de caja, deudas e indicadores es de este día. */
  generado: string;
  actual: FilaResultados;
  anterior: FilaResultados | null;
  /** Variación porcentual contra el mes anterior, calculada por core. */
  variaciones: { ventas: string | null; margenBruto: string | null; resultadoNeto: string | null };
  /** El texto de la IA, si está configurada y el mes es el último cerrado. */
  lectura: string | null;
  kpis: Kpi[];
  caja: {
    consolidado: string;
    minimoOperativo: string | null;
    saldoMasBajo: { inicio: string; saldoFinal: string } | null;
    primeraBajoMinimo: { inicio: string; saldoFinal: string } | null;
    primeraNegativa: { inicio: string; saldoFinal: string } | null;
    cobrosVencidos: string;
    pagosVencidos: string;
  };
  totalACobrar: string;
  deudores: { nombre: string; saldo: string; enMora: boolean; vencimiento: string | null }[];
  totalAPagar: string;
  acreedores: { nombre: string; saldo: string; vencimiento: string | null }[];
  impuestosPendientes: {
    tipo: string;
    periodo: string;
    concepto: string | null;
    saldo: string;
    vencimiento: string;
    vencido: boolean;
  }[];
  totalImpuestos: string;
  mejoresClientes: { nombre: string; ventas: string; margenPorcentual: string | null }[];
  mejoresProductos: { nombre: string; ventas: string; margenPorcentual: string | null }[];
  reposicion: { productos: number; total: string | null };
}

export class InformeNoDisponibleError extends Error {
  constructor(
    motivo: string,
    /** Falta de permiso, no de datos: la ruta contesta 403. */
    readonly sinPermiso = false,
  ) {
    super(motivo);
    this.name = "InformeNoDisponibleError";
  }
}

/** `YYYY-MM` de N meses antes. */
export function mesAnterior(periodo: string, n = 1): string {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Cuántos meses hay entre dos `YYYY-MM` (desde ≤ hasta). */
function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1] = desde.split("-").map(Number) as [number, number];
  const [a2, m2] = hasta.split("-").map(Number) as [number, number];
  return (a2 - a1) * 12 + (m2 - m1);
}

function ultimoDia(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** De mayor a menor por un importe, comparando como Money y no como number. */
function porImporteDesc<T>(filas: T[], importe: (f: T) => string): T[] {
  return [...filas].sort((x, y) => {
    const a = ars(importe(x));
    const b = ars(importe(y));
    return b.mayorQue(a) ? 1 : a.mayorQue(b) ? -1 : 0;
  });
}

export async function armarInforme(
  contexto: Context,
  periodo: string,
  hoy: string,
  opciones: { conLectura: boolean },
): Promise<InformeMensual> {
  const tenantId = contexto.session?.activeOrganizationId;
  if (!tenantId) {
    throw new InformeNoDisponibleError("Sesión no válida.");
  }
  const mesActual = hoy.slice(0, 7);
  const atras = mesesEntre(periodo, mesActual);
  if (atras < 1 || atras > 12) {
    throw new InformeNoDisponibleError("El informe es de alguno de los últimos 12 meses cerrados.");
  }

  const caller = crearCaller(contexto);
  const anteriorPeriodo = mesAnterior(periodo);

  const [estado, panel, clientes, resumenClientes, proveedores, resumenProveedores, impuestos] =
    await Promise.all([
      caller.resultados.estado({ meses: atras + 2 }),
      caller.financiero.resumen(),
      caller.clientes.listar({ tamanoPagina: 100 }),
      caller.clientes.resumen({}),
      caller.proveedores.listar({ tamanoPagina: 100 }),
      caller.proveedores.resumen({}),
      caller.impuestos.listar({ soloImpagos: true, tamanoPagina: 100 }),
    ]);

  // Quien no tiene permiso de ver el panel tampoco lo ve en el informe.
  if (!panel.habilitado) {
    throw new InformeNoDisponibleError("Tu usuario no tiene acceso al panel financiero.", true);
  }

  const actual = estado.find((f) => f.periodo === periodo);
  if (!actual) {
    throw new InformeNoDisponibleError("No hay datos de ese mes.");
  }
  const anterior = estado.find((f) => f.periodo === anteriorPeriodo) ?? null;

  const rango = { desde: `${periodo}-01`, hasta: ultimoDia(periodo) };
  const [porCliente, porProducto, reposicion] = await Promise.all([
    caller.resultados.rentabilidad({ agrupar: "cliente", ...rango }),
    caller.resultados.rentabilidad({ agrupar: "producto", ...rango }),
    caller.stock.reposicion(),
  ]);

  // La lectura es la del último mes cerrado: para otro mes no hay texto.
  let lectura: string | null = null;
  if (opciones.conLectura && periodo === mesAnterior(mesActual)) {
    try {
      lectura = (await caller.explicacion.generar()).texto;
    } catch {
      // Sin IA, sin cupo o sin dos meses para comparar: el informe sale igual.
      lectura = null;
    }
  }

  const pct = (a: string, b: string | undefined) =>
    b === undefined ? null : variacion(ars(a), ars(b)).porcentaje;

  const saldoMasBajo = panel.proyeccion.reduce<(typeof panel.proyeccion)[number] | null>(
    (min, s) => (min === null || ars(s.saldoFinal).menorQue(ars(min.saldoFinal)) ? s : min),
    null,
  );

  const totalImpuestos = impuestos.items.reduce((t, i) => t.sumar(ars(i.saldo)), Money.cero("ARS"));

  const [empresa] = await db
    .select({ nombre: organization.name })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .limit(1);

  return {
    empresa: empresa?.nombre ?? "",
    periodo,
    periodoAnterior: anteriorPeriodo,
    generado: hoy,
    actual,
    anterior,
    variaciones: {
      ventas: pct(actual.ventas, anterior?.ventas),
      margenBruto: pct(actual.margenBruto, anterior?.margenBruto),
      resultadoNeto: pct(actual.resultadoNeto, anterior?.resultadoNeto),
    },
    lectura,
    kpis: panel.kpis,
    caja: {
      consolidado: panel.consolidado.total,
      minimoOperativo: panel.minimoOperativo,
      saldoMasBajo: saldoMasBajo
        ? { inicio: saldoMasBajo.inicio, saldoFinal: saldoMasBajo.saldoFinal }
        : null,
      primeraBajoMinimo: panel.alertas.primeraBajoMinimo,
      primeraNegativa: panel.alertas.primeraNegativa,
      cobrosVencidos: panel.cobrosVencidos,
      pagosVencidos: panel.pagosVencidos,
    },
    totalACobrar: resumenClientes.totalACobrar,
    deudores: porImporteDesc(
      clientes.items.filter((c) => ars(c.saldo).esPositivo()),
      (c) => c.saldo,
    )
      .slice(0, FILAS)
      .map((c) => ({
        nombre: c.razonSocial,
        saldo: c.saldo,
        enMora: c.enMora,
        vencimiento: c.proximoVencimiento,
      })),
    totalAPagar: resumenProveedores.totalAPagar,
    acreedores: porImporteDesc(
      proveedores.items.filter((p) => ars(p.saldoAPagar).esPositivo()),
      (p) => p.saldoAPagar,
    )
      .slice(0, FILAS)
      .map((p) => ({
        nombre: p.razonSocial,
        saldo: p.saldoAPagar,
        vencimiento: p.proximoVencimiento,
      })),
    impuestosPendientes: impuestos.items
      .filter((i) => ars(i.saldo).esPositivo())
      .slice(0, 8)
      .map((i) => ({
        tipo: i.tipo,
        periodo: i.periodo,
        concepto: i.concepto,
        saldo: i.saldo,
        vencimiento: i.fechaVencimiento,
        vencido: i.estado === "vencido",
      })),
    totalImpuestos: totalImpuestos.aStringFiscal(),
    mejoresClientes: porCliente.slice(0, FILAS).map((r) => ({
      nombre: r.clave,
      ventas: r.ventas,
      margenPorcentual: r.margenPorcentual,
    })),
    mejoresProductos: porProducto.slice(0, FILAS).map((r) => ({
      nombre: r.clave,
      ventas: r.ventas,
      margenPorcentual: r.margenPorcentual,
    })),
    reposicion: {
      productos: reposicion.reduce((n, p) => n + p.items.length, 0),
      total: reposicion.every((p) => p.total !== null)
        ? reposicion
            .reduce((t, p) => t.sumar(ars(p.total ?? "0")), Money.cero("ARS"))
            .aStringFiscal()
        : null,
    },
  };
}
