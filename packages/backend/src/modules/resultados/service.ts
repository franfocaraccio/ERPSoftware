import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import {
  estadoResultados,
  type GastoCategoria,
  type MesResultados,
  ocurrenciasRecurrentes,
  rentabilidad,
} from "@erp/core/resultados";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { categorias, gastosRecurrentes } from "../../db/schema/resultados.js";
import { productos } from "../../db/schema/stock.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { conSigno, costoDelItem, ventasQueCuentan } from "../_comunes/comprobantes.js";
import { exigirPropios } from "../_comunes/pertenencia.js";
import { obligacionesImpositivas } from "../impuestos/obligaciones.js";
import type {
  CategoriaActualizar,
  CategoriaInput,
  GastoRecurrenteActualizar,
  GastoRecurrenteInput,
  RentabilidadInput,
} from "./schema.js";

const ARS = "ARS" as const;
const ars = (v: string | null | undefined) => Money.desdeString(v ?? "0", ARS);

export type Categoria = typeof categorias.$inferSelect;
export type GastoRecurrente = typeof gastosRecurrentes.$inferSelect;

// --- Categorías ---

/**
 * La lista con la que arranca cada empresa. Se crea la primera vez que se
 * piden las categorías, y desde ahí la empresa la edita como quiera.
 */
const CATEGORIAS_INICIALES: { nombre: string; tipo: "gasto" | "ingreso" }[] = [
  { nombre: "Sueldos y cargas sociales", tipo: "gasto" },
  { nombre: "Alquiler", tipo: "gasto" },
  { nombre: "Servicios (luz, gas, internet)", tipo: "gasto" },
  { nombre: "Fletes", tipo: "gasto" },
  { nombre: "Honorarios", tipo: "gasto" },
  { nombre: "Comisiones bancarias", tipo: "gasto" },
  { nombre: "Impuestos y tasas", tipo: "gasto" },
  { nombre: "Otros gastos", tipo: "gasto" },
  { nombre: "Intereses ganados", tipo: "ingreso" },
  { nombre: "Otros ingresos", tipo: "ingreso" },
];

async function asegurarIniciales(tx: TenantTx, tenantId: string): Promise<void> {
  const [alguna] = await tx.select({ id: categorias.id }).from(categorias).limit(1);
  if (alguna) {
    return;
  }
  await tx
    .insert(categorias)
    .values(CATEGORIAS_INICIALES.map((c, orden) => ({ tenantId, ...c, orden })))
    .onConflictDoNothing();
}

export async function listarCategorias(actor: Actor): Promise<Categoria[]> {
  return withTenant(actor.tenantId, async (tx) => {
    await asegurarIniciales(tx, actor.tenantId);
    return tx
      .select()
      .from(categorias)
      .orderBy(asc(categorias.tipo), asc(categorias.orden), asc(categorias.nombre));
  });
}

export async function crearCategoria(actor: Actor, input: CategoriaInput): Promise<Categoria> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creada] = await tx
      .insert(categorias)
      .values({ tenantId: actor.tenantId, ...input, orden: 1000 })
      .returning();
    if (!creada) {
      throw new Error("No se pudo crear la categoría");
    }
    await auditar(tx, actor, {
      tabla: "categorias",
      registroId: creada.id,
      accion: "alta",
      detalle: { despues: creada },
    });
    return creada;
  });
}

/** Renombrar o desactivar. Una categoría no se borra: la usan movimientos viejos. */
export async function actualizarCategoria(
  actor: Actor,
  { id, datos }: CategoriaActualizar,
): Promise<Categoria | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(categorias).where(eq(categorias.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(categorias)
      .set(datos)
      .where(eq(categorias.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "categorias",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

// --- Gastos recurrentes ---

export async function listarGastosRecurrentes(actor: Actor): Promise<GastoRecurrente[]> {
  return withTenant(actor.tenantId, (tx) =>
    tx.select().from(gastosRecurrentes).orderBy(asc(gastosRecurrentes.diaDelMes)),
  );
}

async function exigirReferenciasGasto(tx: TenantTx, g: GastoRecurrenteInput) {
  await exigirPropios(tx, cuentas, cuentas.id, [g.cuentaId], "Cuenta no encontrada");
  await exigirPropios(tx, categorias, categorias.id, [g.categoriaId], "Categoría no encontrada");
}

export async function crearGastoRecurrente(
  actor: Actor,
  input: GastoRecurrenteInput,
): Promise<GastoRecurrente> {
  return withTenant(actor.tenantId, async (tx) => {
    await exigirReferenciasGasto(tx, input);
    const [creado] = await tx
      .insert(gastosRecurrentes)
      .values({ tenantId: actor.tenantId, ...input })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear el gasto recurrente");
    }
    await auditar(tx, actor, {
      tabla: "gastos_recurrentes",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarGastoRecurrente(
  actor: Actor,
  { id, datos }: GastoRecurrenteActualizar,
): Promise<GastoRecurrente | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(gastosRecurrentes).where(eq(gastosRecurrentes.id, id));
    if (!antes) {
      return null;
    }
    await exigirReferenciasGasto(tx, datos);
    const [despues] = await tx
      .update(gastosRecurrentes)
      .set(datos)
      .where(eq(gastosRecurrentes.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "gastos_recurrentes",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

/**
 * Las próximas ocurrencias de los gastos recurrentes activos en cuentas en
 * pesos, para la proyección de caja. Sólo se proyectan: el pago real se carga
 * en Tesorería.
 */
export async function recurrentesAProyectar(
  tx: TenantTx,
  desde: string,
  hasta: string,
): Promise<{ fecha: string; importe: Money }[]> {
  const plantillas = await tx
    .select({
      id: gastosRecurrentes.id,
      importe: gastosRecurrentes.importe,
      dia: gastosRecurrentes.diaDelMes,
      desde: gastosRecurrentes.desde,
      hasta: gastosRecurrentes.hasta,
    })
    .from(gastosRecurrentes)
    .innerJoin(cuentas, eq(cuentas.id, gastosRecurrentes.cuentaId))
    .where(and(eq(gastosRecurrentes.activo, true), eq(cuentas.moneda, ARS)));
  return ocurrenciasRecurrentes(
    plantillas.map((p) => ({ ...p, importe: ars(p.importe) })),
    desde,
    hasta,
  ).map(({ fecha, importe }) => ({ fecha, importe }));
}

// --- Estado de resultados ---

function mesesHasta(hasta: string, cantidad: number): string[] {
  const [anio, mes] = hasta.split("-").map(Number) as [number, number];
  return Array.from({ length: cantidad }, (_, i) => {
    const total = anio * 12 + (mes - 1) - (cantidad - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

export interface FilaResultados {
  periodo: string;
  ventas: string;
  costoVentas: string;
  margenBruto: string;
  margenPorcentual: string | null;
  gastos: { categoria: string; importe: string }[];
  totalGastos: string;
  impuestosSobreVentas: string;
  resultadoOperativo: string;
  otrosIngresos: string;
  resultadoNeto: string;
}

/**
 * Resultado mensual devengado (decisión de Fran del 12/10/2026). Cada peso
 * entra una sola vez:
 *
 * - Ventas: el neto de las facturas por fecha de emisión.
 * - Costo de ventas: el costo de los productos vendidos. Un ítem de texto
 *   libre no tiene costo.
 * - Gastos: las compras con categoría (por recepción, en neto) y los
 *   movimientos sin contraparte con categoría de gasto (sueldos, alquiler).
 *   Una compra sin categoría es mercadería: entra como costo al venderse. Un
 *   pago a un proveedor cancela una compra: no es otro gasto.
 * - Impuestos sobre ventas: el IIBB bruto del período. El IVA no es gasto.
 * - Otros ingresos: movimientos sin contraparte con categoría de ingreso.
 *
 * Todo en pesos. No incluye el impuesto a las ganancias.
 */
export async function obtenerEstadoResultados(
  actor: Actor,
  cantidadMeses: number,
): Promise<FilaResultados[]> {
  return withTenant(actor.tenantId, async (tx) => {
    const meses = mesesHasta(hoyEnArgentina().slice(0, 7), cantidadMeses);
    const desde = `${meses[0]}-01`;
    const mes = (col: Parameters<typeof sql>[1]) => sql<string>`to_char(${col}, 'YYYY-MM')`;

    const ventas = await tx
      .select({
        mes: mes(comprobantesVenta.fechaEmision),
        total: sql<string>`sum(${conSigno(comprobantesVenta.neto)})`,
      })
      .from(comprobantesVenta)
      .where(and(ventasQueCuentan(), gte(comprobantesVenta.fechaEmision, desde)))
      .groupBy(sql`1`);

    const costos = await tx
      .select({
        mes: mes(comprobantesVenta.fechaEmision),
        total: sql<string>`sum(${conSigno(costoDelItem())})`,
      })
      .from(itemsComprobanteVenta)
      .innerJoin(comprobantesVenta, eq(comprobantesVenta.id, itemsComprobanteVenta.comprobanteId))
      .innerJoin(productos, eq(productos.id, itemsComprobanteVenta.productoId))
      .where(and(ventasQueCuentan(), gte(comprobantesVenta.fechaEmision, desde)))
      .groupBy(sql`1`);

    const comprasGasto = await tx
      .select({
        mes: mes(comprobantesCompra.fechaRecepcion),
        categoria: categorias.nombre,
        total: sql<string>`sum(${comprobantesCompra.neto})`,
      })
      .from(comprobantesCompra)
      .innerJoin(categorias, eq(categorias.id, comprobantesCompra.categoriaId))
      .where(and(eq(comprobantesCompra.moneda, ARS), gte(comprobantesCompra.fechaRecepcion, desde)))
      .groupBy(sql`1`, categorias.nombre);

    // Un ingreso con categoría de gasto es un reintegro: resta. Y al revés.
    const movimientosCategorizados = await tx
      .select({
        mes: mes(movimientos.fecha),
        categoria: categorias.nombre,
        tipoCategoria: categorias.tipo,
        neto: sql<string>`sum(case when ${movimientos.tipo} = (case when ${categorias.tipo} = 'gasto' then 'egreso' else 'ingreso' end)::tipo_movimiento then ${movimientos.importe} else -${movimientos.importe} end)`,
      })
      .from(movimientos)
      .innerJoin(categorias, eq(categorias.id, movimientos.categoriaId))
      .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
      .where(
        and(
          isNull(movimientos.clienteId),
          isNull(movimientos.proveedorId),
          eq(cuentas.moneda, ARS),
          gte(movimientos.fecha, desde),
        ),
      )
      .groupBy(sql`1`, categorias.nombre, categorias.tipo);

    const iibbPorMes = new Map<string, Money>();
    for (const o of await obligacionesImpositivas(tx, actor.tenantId)) {
      if (o.tipo === "iibb") {
        const m = o.periodo.slice(0, 7);
        iibbPorMes.set(m, (iibbPorMes.get(m) ?? Money.cero(ARS)).sumar(ars(o.bruto)));
      }
    }

    const porMes = <T extends { mes: string }>(filas: T[]) => {
      const mapa = new Map<string, T[]>();
      for (const f of filas) {
        mapa.set(f.mes, [...(mapa.get(f.mes) ?? []), f]);
      }
      return mapa;
    };
    const ventasM = new Map(ventas.map((v) => [v.mes, ars(v.total)]));
    const costosM = new Map(costos.map((c) => [c.mes, ars(c.total)]));
    const comprasM = porMes(comprasGasto);
    const movsM = porMes(movimientosCategorizados);

    const filas: MesResultados[] = meses.map((m) => {
      const gastos: GastoCategoria[] = [
        ...(comprasM.get(m) ?? []).map((c) => ({ categoria: c.categoria, importe: ars(c.total) })),
        ...(movsM.get(m) ?? [])
          .filter((x) => x.tipoCategoria === "gasto")
          .map((x) => ({ categoria: x.categoria, importe: ars(x.neto) })),
      ];
      return {
        periodo: m,
        ventas: ventasM.get(m) ?? Money.cero(ARS),
        costoVentas: costosM.get(m) ?? Money.cero(ARS),
        gastos,
        impuestosSobreVentas: iibbPorMes.get(m) ?? Money.cero(ARS),
        otrosIngresos: Money.sumarTodos(
          (movsM.get(m) ?? []).filter((x) => x.tipoCategoria === "ingreso").map((x) => ars(x.neto)),
          ARS,
        ),
      };
    });

    return estadoResultados(filas).map((r) => ({
      periodo: r.periodo,
      ventas: r.ventas.aStringFiscal(),
      costoVentas: r.costoVentas.aStringFiscal(),
      margenBruto: r.margenBruto.aStringFiscal(),
      margenPorcentual: r.margenPorcentual,
      gastos: r.gastos.map((g) => ({ categoria: g.categoria, importe: g.importe.aStringFiscal() })),
      totalGastos: r.totalGastos.aStringFiscal(),
      impuestosSobreVentas: r.impuestosSobreVentas.aStringFiscal(),
      resultadoOperativo: r.resultadoOperativo.aStringFiscal(),
      otrosIngresos: r.otrosIngresos.aStringFiscal(),
      resultadoNeto: r.resultadoNeto.aStringFiscal(),
    }));
  });
}

// --- Rentabilidad ---

/**
 * Ventas netas, costo y margen por cliente, producto o categoría de producto,
 * en un rango de fechas. Sale de los ítems de las facturas: un ítem de texto
 * libre no tiene costo y se agrupa aparte, para que se vea.
 */
export async function obtenerRentabilidad(actor: Actor, input: RentabilidadInput) {
  return withTenant(actor.tenantId, async (tx) => {
    const clave =
      input.agrupar === "cliente"
        ? sql<string>`${clientes.razonSocial}`
        : input.agrupar === "producto"
          ? sql<string>`coalesce(${productos.descripcion}, 'Sin producto (texto libre)')`
          : sql<string>`coalesce(${productos.categoria}, case when ${productos.id} is null then 'Sin producto (texto libre)' else 'Sin categoría' end)`;

    const filas = await tx
      .select({
        clave,
        ventas: sql<string>`sum(${conSigno(sql`${itemsComprobanteVenta.cantidad} * ${itemsComprobanteVenta.precioUnitario}`)})`,
        costo: sql<string>`sum(${conSigno(costoDelItem())})`,
        cantidad: sql<string>`sum(${conSigno(itemsComprobanteVenta.cantidad)})`,
        sinCosto: sql<boolean>`bool_or(${productos.id} is null)`,
      })
      .from(itemsComprobanteVenta)
      .innerJoin(comprobantesVenta, eq(comprobantesVenta.id, itemsComprobanteVenta.comprobanteId))
      .innerJoin(clientes, eq(clientes.id, comprobantesVenta.clienteId))
      .leftJoin(productos, eq(productos.id, itemsComprobanteVenta.productoId))
      .where(
        and(
          ventasQueCuentan(),
          gte(comprobantesVenta.fechaEmision, input.desde),
          lte(comprobantesVenta.fechaEmision, input.hasta),
        ),
      )
      .groupBy(sql`1`);

    const sinCosto = new Set(filas.filter((f) => f.sinCosto).map((f) => f.clave));
    return rentabilidad(
      filas.map((f) => ({
        clave: f.clave,
        ventas: ars(f.ventas),
        costo: ars(f.costo),
        cantidad: f.cantidad,
      })),
    ).map((r) => ({
      clave: r.clave,
      ventas: r.ventas.aStringFiscal(),
      costo: r.costo.aStringFiscal(),
      margen: r.margen.aStringFiscal(),
      margenPorcentual: r.margenPorcentual,
      cantidad: r.cantidad,
      /** Promedios por unidad: sólo dicen algo agrupando por producto. */
      precioPromedio: r.precioPromedio?.aStringFiscal() ?? null,
      costoPromedio: r.costoPromedio?.aStringFiscal() ?? null,
      /** Tiene ítems sin producto: su costo está subestimado. */
      incluyeTextoLibre: sinCosto.has(r.clave),
    }));
  });
}
