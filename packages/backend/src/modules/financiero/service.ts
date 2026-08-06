import { type FilaProyeccion, proyectarCaja } from "@erp/core/cashflow";
import { hoyEnArgentina } from "@erp/core/dates";
import {
  cicloConversionEfectivo,
  concentracionLibrador,
  diasRotacionStock,
  dpo,
  dso,
  liquidezCorriente,
  margenBrutoPorcentual,
  type Semaforo,
  semaforoDe,
} from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import { estadoImpuesto, importeDeterminado } from "@erp/core/tax";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { impuestos } from "../../db/schema/impuestos.js";
import { productos } from "../../db/schema/stock.js";
import { cheques, cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { obtenerParametros } from "./parametros.js";

const ARS = "ARS" as const;
const ars = (valor: string | null | undefined) => Money.desdeString(valor ?? "0", ARS);

export interface Kpi {
  id: string;
  etiqueta: string;
  valor: string | null;
  unidad: "moneda" | "dias" | "porcentaje" | "ratio" | "conteo";
  semaforo: Semaforo;
  detalle: string;
}

export interface ResumenFinanciero {
  kpis: Kpi[];
  proyeccion: {
    semana: number;
    inicio: string;
    fin: string;
    cobros: string;
    pagos: string;
    saldoInicial: string;
    saldoFinal: string;
    semaforo: "ok" | "alerta";
  }[];
  saldoPorCuenta: { nombre: string; moneda: string; saldo: string }[];
  ventasPorMes: { mes: string; total: string }[];
  minimoOperativo: string | null;
}

function diasAtras(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Arma los KPIs de la sección 8.1 y la proyección de la 8.2 a partir de los
 * datos reales. Toda la aritmética vive en @erp/core: acá solo se consultan
 * los agregados y se los pasa a las funciones puras.
 */
export async function resumenFinanciero({ tenantId }: Actor): Promise<ResumenFinanciero> {
  return withTenant(tenantId, async (tx) => {
    const hoy = hoyEnArgentina();
    const hace30 = diasAtras(hoy, 30);
    const parametros = await obtenerParametros(tx, tenantId);

    // --- Tesorería ---
    const saldosCuentas = await tx
      .select({
        nombre: cuentas.nombre,
        moneda: cuentas.moneda,
        ingresos: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'ingreso' then ${movimientos.importe} else 0 end), 0)`,
        egresos: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'egreso' then ${movimientos.importe} else 0 end), 0)`,
      })
      .from(cuentas)
      .leftJoin(movimientos, eq(movimientos.cuentaId, cuentas.id))
      .groupBy(cuentas.id, cuentas.nombre, cuentas.moneda);

    const saldoPorCuenta = saldosCuentas.map((c) => ({
      nombre: c.nombre,
      moneda: c.moneda,
      saldo: ars(c.ingresos).restar(ars(c.egresos)).aStringFiscal(),
    }));

    // Solo pesos: consolidar monedas exigiría una cotización, fuera de alcance.
    const saldoTesoreria = Money.sumarTodos(
      saldoPorCuenta.filter((c) => c.moneda === ARS).map((c) => ars(c.saldo)),
      ARS,
    );

    // --- Ventas y cobranzas ---
    const [ventas] = await tx
      .select({
        totalPeriodo: sql<string>`coalesce(sum(case when ${comprobantesVenta.fechaEmision} >= ${hace30} then ${comprobantesVenta.total} else 0 end), 0)`,
        totalGeneral: sql<string>`coalesce(sum(${comprobantesVenta.total}), 0)`,
      })
      .from(comprobantesVenta);

    const [cobrado] = await tx
      .select({
        total: sql<string>`coalesce(sum(${movimientos.importe}), 0)`,
      })
      .from(movimientos)
      .where(and(eq(movimientos.tipo, "ingreso"), sql`${movimientos.clienteId} is not null`));

    const porCobrar = ars(ventas?.totalGeneral).restar(ars(cobrado?.total));

    // --- Compras y pagos ---
    const [compras] = await tx
      .select({
        totalPeriodo: sql<string>`coalesce(sum(case when ${comprobantesCompra.fechaRecepcion} >= ${hace30} then ${comprobantesCompra.total} else 0 end), 0)`,
        totalGeneral: sql<string>`coalesce(sum(${comprobantesCompra.total}), 0)`,
      })
      .from(comprobantesCompra);

    const [pagado] = await tx
      .select({ total: sql<string>`coalesce(sum(${movimientos.importe}), 0)` })
      .from(movimientos)
      .where(and(eq(movimientos.tipo, "egreso"), sql`${movimientos.proveedorId} is not null`));

    const porPagar = ars(compras?.totalGeneral).restar(ars(pagado?.total));

    // --- Stock ---
    // Las salidas se derivan de los ítems facturados: en esta fase no hay tabla
    // de movimientos de stock, y una venta es la salida real del producto.
    const [salidas] = await tx
      .select({
        cantidad: sql<string>`coalesce(sum(${itemsComprobanteVenta.cantidad}), 0)`,
        costo: sql<string>`coalesce(sum(${itemsComprobanteVenta.cantidad} * coalesce(${productos.costoUnitario}, 0)), 0)`,
      })
      .from(itemsComprobanteVenta)
      .innerJoin(comprobantesVenta, eq(comprobantesVenta.id, itemsComprobanteVenta.comprobanteId))
      .leftJoin(productos, eq(productos.id, itemsComprobanteVenta.productoId))
      .where(gte(comprobantesVenta.fechaEmision, hace30));

    const [stock] = await tx
      .select({ promedio: sql<string>`coalesce(avg(${productos.stockActual}), 0)` })
      .from(productos);

    // --- Cheques ---
    const chequesEnCartera = await tx
      .select({
        importe: cheques.importe,
        fechaPago: cheques.fechaPago,
        libradorNombre: cheques.libradorNombre,
        libradorCliente: clientes.razonSocial,
      })
      .from(cheques)
      .leftJoin(clientes, eq(clientes.id, cheques.libradorClienteId))
      .where(eq(cheques.estado, "en_cartera"));

    const concentracion = concentracionLibrador(
      chequesEnCartera.map((c) => ({
        librador: c.libradorCliente ?? c.libradorNombre ?? "Sin identificar",
        importe: ars(c.importe),
      })),
    );

    // --- Impuestos ---
    const filasImpuestos = await tx.select().from(impuestos);
    const impuestosVencidos = filasImpuestos.filter((i) => {
      const determinado = importeDeterminado(ars(i.baseImponible), i.alicuota);
      return (
        estadoImpuesto(determinado, ars(i.importePagado), i.fechaVencimiento, hoy) === "vencido"
      );
    }).length;

    // --- KPIs ---
    const liquidez = liquidezCorriente(saldoTesoreria, porCobrar, porPagar);
    const diasCobro = dso(porCobrar, ars(ventas?.totalPeriodo));
    const diasPago = dpo(porPagar, ars(compras?.totalPeriodo));
    const rotacion = diasRotacionStock(salidas?.cantidad ?? "0", stock?.promedio ?? "0");
    const ciclo = cicloConversionEfectivo(diasCobro, rotacion, diasPago);
    const margen = margenBrutoPorcentual(ars(ventas?.totalPeriodo), ars(salidas?.costo));

    const umbralMargen = parametros.margenObjetivo ? Number(parametros.margenObjetivo) : null;

    const kpis: Kpi[] = [
      {
        id: "liquidez",
        etiqueta: "Liquidez corriente",
        valor: liquidez,
        unidad: "ratio",
        semaforo: semaforoDe(liquidez === null ? null : Number(liquidez), {
          umbral: 1,
          direccion: "mayor_es_mejor",
        }),
        detalle: "Caja más cobranzas sobre lo que hay que pagar",
      },
      {
        id: "dso",
        etiqueta: "DSO",
        valor: diasCobro === null ? null : String(diasCobro),
        unidad: "dias",
        semaforo: semaforoDe(diasCobro, {
          umbral: parametros.umbralMoraDias,
          direccion: "menor_es_mejor",
        }),
        detalle: `Días promedio de cobro (umbral ${parametros.umbralMoraDias})`,
      },
      {
        id: "dpo",
        etiqueta: "DPO",
        valor: diasPago === null ? null : String(diasPago),
        unidad: "dias",
        semaforo: "sin_datos",
        detalle: "Días promedio de pago a proveedores",
      },
      {
        id: "ciclo",
        etiqueta: "Ciclo de conversión",
        valor: ciclo === null ? null : String(ciclo),
        unidad: "dias",
        semaforo: "sin_datos",
        detalle: "Días que la plata queda inmovilizada",
      },
      {
        id: "rotacion",
        etiqueta: "Rotación de stock",
        valor: rotacion === null ? null : String(rotacion),
        unidad: "dias",
        semaforo: semaforoDe(rotacion, { umbral: 60, direccion: "menor_es_mejor" }),
        detalle: "Días que tarda en salir el stock promedio",
      },
      {
        id: "margen",
        etiqueta: "Margen bruto",
        valor: margen,
        unidad: "porcentaje",
        semaforo:
          umbralMargen === null
            ? "sin_datos"
            : semaforoDe(margen === null ? null : Number(margen), {
                umbral: umbralMargen,
                direccion: "mayor_es_mejor",
              }),
        detalle:
          umbralMargen === null ? "Sin margen objetivo definido" : `Objetivo ${umbralMargen}%`,
      },
      {
        id: "cheques",
        etiqueta: "Concentración de cheques",
        valor: concentracion?.porcentaje ?? null,
        unidad: "porcentaje",
        semaforo: semaforoDe(concentracion === null ? null : Number(concentracion.porcentaje), {
          umbral: 40,
          direccion: "menor_es_mejor",
        }),
        detalle: concentracion
          ? `Mayor librador: ${concentracion.librador}`
          : "Sin cheques en cartera",
      },
      {
        id: "impuestos_vencidos",
        etiqueta: "Impuestos vencidos",
        valor: String(impuestosVencidos),
        unidad: "conteo",
        semaforo: semaforoDe(impuestosVencidos, { umbral: 0, direccion: "menor_es_mejor" }),
        detalle: "Obligaciones cuyo vencimiento ya pasó",
      },
    ];

    // --- Proyección de caja ---
    // Cobros: facturas de venta según su condición de venta, más los cheques
    // en cartera por su fecha de pago. Pagos: compras según su plazo, más los
    // vencimientos impositivos.
    const cobrosFacturas = await tx
      .select({
        fecha: sql<string>`to_char(${comprobantesVenta.fechaEmision} + ${comprobantesVenta.condicionVentaDias} * interval '1 day', 'YYYY-MM-DD')`,
        importe: comprobantesVenta.total,
      })
      .from(comprobantesVenta);

    const pagosCompras = await tx
      .select({
        fecha: sql<string>`to_char(${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day', 'YYYY-MM-DD')`,
        importe: comprobantesCompra.total,
      })
      .from(comprobantesCompra);

    const pagosImpuestos = filasImpuestos
      .map((i) => {
        const determinado = importeDeterminado(ars(i.baseImponible), i.alicuota);
        const saldo = determinado.restar(ars(i.importePagado));
        return { fecha: i.fechaVencimiento, importe: saldo };
      })
      .filter((p) => p.importe.esPositivo());

    const proyeccion: FilaProyeccion[] = proyectarCaja({
      hoy,
      saldoInicial: saldoTesoreria,
      cobros: [
        ...cobrosFacturas.map((c) => ({ fecha: c.fecha, importe: ars(c.importe) })),
        ...chequesEnCartera.map((c) => ({ fecha: c.fechaPago, importe: ars(c.importe) })),
      ],
      pagos: [
        ...pagosCompras.map((p) => ({ fecha: p.fecha, importe: ars(p.importe) })),
        ...pagosImpuestos,
      ],
      minimoOperativo: parametros.minimoOperativo ? ars(parametros.minimoOperativo) : null,
    });

    // --- Serie de ventas por mes, para el gráfico de evolución ---
    const ventasPorMes = await tx
      .select({
        mes: sql<string>`to_char(date_trunc('month', ${comprobantesVenta.fechaEmision}), 'YYYY-MM')`,
        total: sql<string>`coalesce(sum(${comprobantesVenta.total}), 0)`,
      })
      .from(comprobantesVenta)
      .groupBy(sql`date_trunc('month', ${comprobantesVenta.fechaEmision})`)
      .orderBy(sql`date_trunc('month', ${comprobantesVenta.fechaEmision})`);

    return {
      kpis,
      proyeccion: proyeccion.map((f) => ({
        semana: f.semana,
        inicio: f.inicio,
        fin: f.fin,
        cobros: f.cobros.aStringFiscal(),
        pagos: f.pagos.aStringFiscal(),
        saldoInicial: f.saldoInicial.aStringFiscal(),
        saldoFinal: f.saldoFinal.aStringFiscal(),
        semaforo: f.semaforo,
      })),
      saldoPorCuenta,
      ventasPorMes,
      minimoOperativo: parametros.minimoOperativo,
    };
  });
}
