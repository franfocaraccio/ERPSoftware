import {
  alertasAnticipadas,
  type FilaProyeccion,
  proyectarCaja,
  semanasDelHorizonte,
  separarVencidos,
} from "@erp/core/cashflow";
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
import { DIAS_PRESENTACION_CHEQUE } from "@erp/core/treasury";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { productos } from "../../db/schema/stock.js";
import { cheques, cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { conSigno, totalConSigno, ventasQueCuentan } from "../_comunes/comprobantes.js";
import { cotizacionesDolar } from "../cotizaciones/dolar.js";
import { saldosCuentaCorriente } from "../cuenta-corriente/saldos.js";
import { obligacionesImpositivas } from "../impuestos/obligaciones.js";
import { recurrentesAProyectar } from "../resultados/service.js";
import { obtenerParametros } from "./parametros.js";

const ARS = "ARS" as const;
const ars = (valor: string | null | undefined) => Money.desdeString(valor ?? "0", ARS);

export interface ComponenteKpi {
  etiqueta: string;
  valor: string;
  unidad: "moneda" | "dias" | "cantidad" | "conteo";
}

export interface Kpi {
  id: string;
  etiqueta: string;
  valor: string | null;
  unidad: "moneda" | "dias" | "porcentaje" | "ratio" | "conteo";
  semaforo: Semaforo;
  detalle: string;
  /** Los números con los que se calcula: lo que se ve al abrir la tarjeta. */
  desglose: ComponenteKpi[];
  /** Por qué no hay valor, en palabras de quien usa el sistema. Null si hay. */
  motivoSinDatos: string | null;
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
  /**
   * Cobros que ya vencieron y siguen impagos. No entran en la proyección —es
   * plata que no llegó cuando debía— y se informan aparte.
   */
  cobrosVencidos: string;
  /** Pagos vencidos e impagos que la proyección pone en la semana en curso. */
  pagosVencidos: string;
  saldoPorCuenta: { nombre: string; moneda: string; saldo: string }[];
  /**
   * Todas las cuentas en pesos, con las de dólares convertidas al oficial
   * comprador (decisión de Fran del 12/10/2026): lo que te darían por vender
   * esos dólares en el banco. Sólo para mostrar: la liquidez y la proyección
   * siguen en pesos, para no depender de una cotización de mercado.
   */
  consolidado: {
    pesos: string;
    dolares: string;
    /** Pesos por dólar. Null si no se pudo traer: los dólares no se suman. */
    cotizacion: string | null;
    fechaCotizacion: string | null;
    total: string;
  };
  /** Ventas netas (sin IVA) por mes. */
  ventasPorMes: { mes: string; total: string }[];
  minimoOperativo: string | null;
  /**
   * Lo que hay que saber antes de que pase: en qué semana la caja proyectada
   * queda bajo el mínimo o en negativo. Aritmética, sin IA.
   */
  alertas: {
    primeraBajoMinimo: { semana: number; inicio: string; saldoFinal: string } | null;
    primeraNegativa: { semana: number; inicio: string; saldoFinal: string } | null;
  };
}

function diasAtras(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Movimientos de una cuenta en pesos, de un tipo, agrupados por contraparte. */
function movimientosEnPesosPor(
  tx: TenantTx,
  tipo: "ingreso" | "egreso",
  contraparte: typeof movimientos.clienteId | typeof movimientos.proveedorId,
) {
  return tx
    .select({
      contraparte: sql<string | null>`${contraparte}`,
      total: sql<string>`sum(${movimientos.importe})`,
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(and(eq(movimientos.tipo, tipo), isNotNull(contraparte), eq(cuentas.moneda, ARS)))
    .groupBy(contraparte);
}

/**
 * Arma los KPIs de la sección 8.1 y la proyección de la 8.2 a partir de los
 * datos reales. Toda la aritmética vive en @erp/core: acá solo se consultan
 * los agregados y se los pasa a las funciones puras.
 */
export async function resumenFinanciero({ tenantId }: Actor): Promise<ResumenFinanciero> {
  // Antes de abrir la transacción: no tener una conexión tomada mientras se
  // espera a un servicio externo. Si falla, el panel sale igual, sin convertir.
  const oficial = await cotizacionesDolar()
    .then((c) => c.oficial)
    .catch(() => null);
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
      saldo: Money.desdeString(c.ingresos, c.moneda)
        .restar(Money.desdeString(c.egresos, c.moneda))
        .aStringFiscal(),
    }));

    // La liquidez y la proyección van sólo en pesos.
    const saldoTesoreria = Money.sumarTodos(
      saldoPorCuenta.filter((c) => c.moneda === ARS).map((c) => ars(c.saldo)),
      ARS,
    );
    const saldoDolares = Money.sumarTodos(
      saldoPorCuenta
        .filter((c) => c.moneda === "USD")
        .map((c) => Money.desdeString(c.saldo, "USD")),
      "USD",
    );
    const dolaresEnPesos = oficial ? saldoDolares.convertir(ARS, oficial.compra) : null;

    // --- Ventas y cobranzas ---
    // Sólo deuda real en pesos (`ventasQueCuentan`), igual que Clientes. Las
    // notas de crédito restan, acá y en todo este archivo.
    //
    // DSO y por cobrar usan el total: la deuda del cliente incluye el IVA. El
    // margen y la evolución de ventas usan el neto: el IVA no es venta, es
    // plata que se le debe a ARCA.
    const [ventas] = await tx
      .select({
        totalPeriodo: sql<string>`coalesce(sum(case when ${comprobantesVenta.fechaEmision} >= ${hace30} then ${totalConSigno()} else 0 end), 0)`,
        netoPeriodo: sql<string>`coalesce(sum(case when ${comprobantesVenta.fechaEmision} >= ${hace30} then ${conSigno(comprobantesVenta.neto)} else 0 end), 0)`,
        totalGeneral: sql<string>`coalesce(sum(${totalConSigno()}), 0)`,
      })
      .from(comprobantesVenta)
      .where(ventasQueCuentan());

    // Un movimiento hereda la moneda de su cuenta: los cobros en pesos son los
    // de cuentas en pesos.
    const cobrosPorCliente = await movimientosEnPesosPor(tx, "ingreso", movimientos.clienteId);
    const cobrado = Money.sumarTodos(
      cobrosPorCliente.map((c) => ars(c.total)),
      ARS,
    );
    const porCobrar = ars(ventas?.totalGeneral).restar(cobrado);

    // --- Compras y pagos ---
    const [compras] = await tx
      .select({
        totalPeriodo: sql<string>`coalesce(sum(case when ${comprobantesCompra.fechaRecepcion} >= ${hace30} then ${comprobantesCompra.total} else 0 end), 0)`,
        totalGeneral: sql<string>`coalesce(sum(${comprobantesCompra.total}), 0)`,
      })
      .from(comprobantesCompra)
      .where(eq(comprobantesCompra.moneda, ARS));

    const pagosPorProveedor = await movimientosEnPesosPor(tx, "egreso", movimientos.proveedorId);
    const pagado = Money.sumarTodos(
      pagosPorProveedor.map((p) => ars(p.total)),
      ARS,
    );
    const porPagar = ars(compras?.totalGeneral).restar(pagado);

    // --- Stock ---
    // Las salidas se derivan de los ítems facturados: una venta es la salida
    // real del producto. Sólo ítems del catálogo —una línea de texto libre no tiene costo ni
    // unidad comparable con el stock— y con signo: una nota de crédito es una
    // devolución, que vuelve a entrar y descuenta su costo.
    const [salidas] = await tx
      .select({
        cantidad: sql<string>`coalesce(sum(${conSigno(itemsComprobanteVenta.cantidad)}), 0)`,
        costo: sql<string>`coalesce(sum(${conSigno(sql`${itemsComprobanteVenta.cantidad} * coalesce(${productos.costoUnitario}, 0)`)}), 0)`,
      })
      .from(itemsComprobanteVenta)
      .innerJoin(comprobantesVenta, eq(comprobantesVenta.id, itemsComprobanteVenta.comprobanteId))
      .innerJoin(productos, eq(productos.id, itemsComprobanteVenta.productoId))
      .where(and(ventasQueCuentan(), gte(comprobantesVenta.fechaEmision, hace30)));

    // El stock se compara en pesos, al costo, contra el costo de lo vendido:
    // sumar unidades mezclaría tornillos con taladros, y comparar el total
    // vendido contra el stock de UN producto promedio (como se hacía) daba una
    // rotación tantas veces más corta como productos hubiera.
    const [stock] = await tx
      .select({
        valor: sql<string>`coalesce(sum(greatest(${productos.stockActual}, 0) * coalesce(${productos.costoUnitario}, 0)), 0)`,
      })
      .from(productos);

    // --- Cheques ---
    const chequesEnCartera = await tx
      .select({
        id: cheques.id,
        importe: cheques.importe,
        fechaPago: cheques.fechaPago,
        libradorNombre: cheques.libradorNombre,
        libradorClienteId: cheques.libradorClienteId,
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
    // Las mismas obligaciones que muestra la pantalla de Impuestos: IVA
    // calculado, IIBB neto de retenciones y lo cargado a mano.
    const obligaciones = await obligacionesImpositivas(tx, tenantId);
    const impuestosVencidos = obligaciones.filter((o) => o.estado === "vencido").length;

    // --- KPIs ---
    const liquidez = liquidezCorriente(saldoTesoreria, porCobrar, porPagar);
    const diasCobro = dso(porCobrar, ars(ventas?.totalPeriodo));
    const diasPago = dpo(porPagar, ars(compras?.totalPeriodo));
    const rotacion = diasRotacionStock(salidas?.costo ?? "0", stock?.valor ?? "0");
    const ciclo = cicloConversionEfectivo(diasCobro, rotacion, diasPago);
    const margen = margenBrutoPorcentual(ars(ventas?.netoPeriodo), ars(salidas?.costo));

    const umbralMargen = parametros.margenObjetivo ? Number(parametros.margenObjetivo) : null;

    const plata = (etiqueta: string, valor: Money): ComponenteKpi => ({
      etiqueta,
      valor: valor.aStringFiscal(),
      unidad: "moneda",
    });
    const sinVentas = "No hubo ventas en los últimos 30 días.";
    const saldoVencido = Money.sumarTodos(
      obligaciones.filter((o) => o.estado === "vencido").map((o) => ars(o.saldo)),
      ARS,
    );
    const enCartera = Money.sumarTodos(
      chequesEnCartera.map((c) => ars(c.importe)),
      ARS,
    );

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
        desglose: [
          plata("Caja y bancos en pesos", saldoTesoreria),
          plata("Por cobrar a clientes", porCobrar),
          plata("Por pagar a proveedores", porPagar),
        ],
        motivoSinDatos:
          liquidez === null ? "No hay deudas con proveedores contra las que compararla." : null,
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
        desglose: [
          plata("Por cobrar a clientes", porCobrar),
          plata("Ventas de los últimos 30 días (con IVA)", ars(ventas?.totalPeriodo)),
        ],
        motivoSinDatos: diasCobro === null ? sinVentas : null,
      },
      {
        id: "dpo",
        etiqueta: "DPO",
        valor: diasPago === null ? null : String(diasPago),
        unidad: "dias",
        semaforo: "sin_datos",
        detalle: "Días promedio de pago a proveedores",
        desglose: [
          plata("Por pagar a proveedores", porPagar),
          plata("Compras de los últimos 30 días", ars(compras?.totalPeriodo)),
        ],
        motivoSinDatos: diasPago === null ? "No hubo compras en los últimos 30 días." : null,
      },
      {
        id: "ciclo",
        etiqueta: "Ciclo de conversión",
        valor: ciclo === null ? null : String(ciclo),
        unidad: "dias",
        semaforo: "sin_datos",
        detalle: "Días que la plata queda inmovilizada",
        desglose: [
          ...(diasCobro === null
            ? []
            : [{ etiqueta: "DSO", valor: String(diasCobro), unidad: "dias" as const }]),
          ...(rotacion === null
            ? []
            : [
                {
                  etiqueta: "+ Rotación de stock",
                  valor: String(rotacion),
                  unidad: "dias" as const,
                },
              ]),
          ...(diasPago === null
            ? []
            : [{ etiqueta: "− DPO", valor: String(diasPago), unidad: "dias" as const }]),
        ],
        motivoSinDatos:
          ciclo === null
            ? "Necesita DSO, DPO y rotación de stock: falta alguno de los tres."
            : null,
      },
      {
        id: "rotacion",
        etiqueta: "Rotación de stock",
        valor: rotacion === null ? null : String(rotacion),
        unidad: "dias",
        semaforo: semaforoDe(rotacion, { umbral: 60, direccion: "menor_es_mejor" }),
        detalle: "Días que tarda en venderse el stock actual",
        desglose: [
          plata("Costo de lo vendido en 30 días", ars(salidas?.costo)),
          plata("Stock actual, valuado al costo", ars(stock?.valor)),
        ],
        motivoSinDatos:
          rotacion === null
            ? "No hubo ventas de productos del stock en los últimos 30 días, o no hay stock cargado. Los ítems de texto libre no cuentan."
            : null,
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
        desglose: [
          plata("Ventas netas de 30 días (sin IVA)", ars(ventas?.netoPeriodo)),
          plata("Costo de lo vendido", ars(salidas?.costo)),
        ],
        motivoSinDatos: margen === null ? sinVentas : null,
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
        desglose: [
          plata("Cheques en cartera", enCartera),
          { etiqueta: "Cantidad", valor: String(chequesEnCartera.length), unidad: "conteo" },
        ],
        motivoSinDatos: concentracion === null ? "No hay cheques en cartera." : null,
      },
      {
        id: "impuestos_vencidos",
        etiqueta: "Impuestos vencidos",
        valor: String(impuestosVencidos),
        unidad: "conteo",
        semaforo: semaforoDe(impuestosVencidos, { umbral: 0, direccion: "menor_es_mejor" }),
        detalle: "Obligaciones cuyo vencimiento ya pasó",
        desglose: [plata("Saldo vencido", saldoVencido)],
        motivoSinDatos: null,
      },
    ];

    // --- Proyección de caja ---
    // Cobros: lo que queda por cobrar de cada factura, por su vencimiento, más
    // los cheques en cartera por su fecha de pago. Pagos: lo que queda por
    // pagar de cada compra, más los saldos impositivos.
    //
    // Lo ya cobrado o pagado se descuenta de cada comprobante (imputaciones y,
    // lo que no se imputó, FIFO): sin eso, una factura cobrada se seguía
    // proyectando como un cobro por venir.
    // Un cheque que ya tiene su movimiento de ingreso está en la caja: si
    // además se proyectara, se contaría dos veces.
    const chequesConMovimiento = new Set(
      (
        await tx
          .select({ chequeId: movimientos.chequeId })
          .from(movimientos)
          .where(isNotNull(movimientos.chequeId))
      ).map((m) => m.chequeId),
    );
    const chequesPorCobrar = chequesEnCartera.filter((c) => !chequesConMovimiento.has(c.id));

    // Los cheques en cartera cubren facturas de su librador: la factura no se
    // proyecta, el cheque sí, en su fecha.
    const chequesPorCliente = new Map<string, Money>();
    for (const c of chequesPorCobrar) {
      if (c.libradorClienteId) {
        chequesPorCliente.set(
          c.libradorClienteId,
          (chequesPorCliente.get(c.libradorClienteId) ?? Money.cero(ARS)).sumar(ars(c.importe)),
        );
      }
    }

    // La cuenta corriente (imputaciones y FIFO) dice qué queda por cobrar y
    // pagar de cada comprobante. Es el mismo cálculo que Clientes y Proveedores.
    const [ventasCC, comprasCC] = [
      await saldosCuentaCorriente(tx, "ventas", { creditoExtra: chequesPorCliente }),
      await saldosCuentaCorriente(tx, "compras"),
    ];
    const aProyectar = (saldos: typeof ventasCC.comprobantes) =>
      saldos
        .filter((s) => s.pendiente.esPositivo())
        .map((s) => ({ fecha: s.vencimiento, importe: s.pendiente }));

    // Prudencia: un cobro vencido no se proyecta. Ya no llegó cuando debía, y
    // contar con él dibuja una caja mejor que la real.
    const facturasACobrar = separarVencidos(aProyectar(ventasCC.comprobantes), hoy);

    // Un cheque con la fecha pasada se puede depositar hoy, mientras esté
    // dentro del plazo de presentación. Pasado ese plazo ya no es cobrable.
    const limitePresentacion = diasAtras(hoy, DIAS_PRESENTACION_CHEQUE);
    const cobrosCheques = chequesPorCobrar
      .filter((c) => c.fechaPago >= limitePresentacion)
      .map((c) => ({ fecha: c.fechaPago < hoy ? hoy : c.fechaPago, importe: ars(c.importe) }));

    const pagosCompras = aProyectar(comprasCC.comprobantes);

    const pagosImpuestos = obligaciones
      .map((o) => ({ fecha: o.fechaVencimiento, importe: ars(o.saldo) }))
      .filter((p) => p.importe.esPositivo());

    // Un pago vencido e impago sigue siendo plata que hay que poner: va a hoy.
    // Antes se descartaba por caer antes del horizonte, y la proyección
    // mostraba pagos en cero con deudas vencidas por millones.
    const pagos = separarVencidos([...pagosCompras, ...pagosImpuestos], hoy);

    // Sueldos, alquiler: no tienen comprobante pero se pagan todos los meses.
    // Se proyectan desde hoy hasta el fin del horizonte.
    const horizonte = semanasDelHorizonte(hoy);
    const recurrentes = await recurrentesAProyectar(tx, hoy, horizonte.at(-1)?.fin ?? hoy);

    const proyeccion: FilaProyeccion[] = proyectarCaja({
      hoy,
      saldoInicial: saldoTesoreria,
      cobros: [...facturasACobrar.vigentes, ...cobrosCheques],
      pagos: [...pagos.vigentes, ...pagos.vencidosAHoy, ...recurrentes],
      minimoOperativo: parametros.minimoOperativo ? ars(parametros.minimoOperativo) : null,
    });
    const alertas = alertasAnticipadas(
      proyeccion,
      parametros.minimoOperativo ? ars(parametros.minimoOperativo) : null,
    );
    const resumirSemana = (f: FilaProyeccion | null) =>
      f ? { semana: f.semana, inicio: f.inicio, saldoFinal: f.saldoFinal.aStringFiscal() } : null;

    // --- Serie de ventas por mes, para el gráfico de evolución ---
    // Neto: el IVA no es venta.
    const ventasPorMes = await tx
      .select({
        mes: sql<string>`to_char(date_trunc('month', ${comprobantesVenta.fechaEmision}), 'YYYY-MM')`,
        total: sql<string>`coalesce(sum(${conSigno(comprobantesVenta.neto)}), 0)`,
      })
      .from(comprobantesVenta)
      .where(ventasQueCuentan())
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
      cobrosVencidos: facturasACobrar.totalVencido.aStringFiscal(),
      pagosVencidos: pagos.totalVencido.aStringFiscal(),
      saldoPorCuenta,
      consolidado: {
        pesos: saldoTesoreria.aStringFiscal(),
        dolares: saldoDolares.aStringFiscal(),
        cotizacion: oficial?.compra ?? null,
        fechaCotizacion: oficial?.fecha ?? null,
        total: (dolaresEnPesos
          ? saldoTesoreria.sumar(dolaresEnPesos)
          : saldoTesoreria
        ).aStringFiscal(),
      },
      ventasPorMes,
      minimoOperativo: parametros.minimoOperativo,
      alertas: {
        primeraBajoMinimo: resumirSemana(alertas.primeraBajoMinimo),
        primeraNegativa: resumirSemana(alertas.primeraNegativa),
      },
    };
  });
}
