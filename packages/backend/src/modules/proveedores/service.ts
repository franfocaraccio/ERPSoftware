import { saldoCuentaCorriente } from "@erp/core/balances";
import { type Concentracion, concentracionMaxima, type Semaforo, semaforoDe } from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import { and, count, eq, ilike, or, type SQL, sql, sum } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { aplicarOrden } from "../_comunes/orden.js";
import { leerParametros } from "../parametros/service.js";
import type { ProveedorActualizar, ProveedoresListar, ProveedorInput } from "./schema.js";

export type Proveedor = typeof proveedores.$inferSelect;

/** El saldo a pagar no se persiste: se calcula al leer. */
export interface ProveedorConSaldo extends Proveedor {
  saldoAPagar: string;
  proximoVencimiento: string | null;
  /**
   * Tiene comprobantes en otra moneda, que NO entran en `saldoAPagar`. Sumar
   * pesos y dólares en un solo número daría un importe que no existe.
   */
  tieneMonedaExtranjera: boolean;
}

export interface ResumenProveedores {
  /** Suma de los saldos a pagar, en pesos. Los saldos a favor no restan. */
  totalAPagar: string;
  /** Cuántos proveedores tienen saldo pendiente. */
  acreedores: number;
  concentracion: Concentracion | null;
  umbralConcentracion: string;
  /** "alerta" cuando el proveedor más grande supera el umbral de la empresa. */
  semaforo: Semaforo;
  hayMonedaExtranjera: boolean;
}

/** Los filtros de la pantalla. Compartidos por el listado y el resumen. */
export type FiltrosProveedores = Pick<ProveedoresListar, "busqueda" | "condicionIva">;

function filtrosDe(input: FiltrosProveedores): SQL | undefined {
  const condiciones: SQL[] = [];
  if (input.busqueda) {
    const busqueda = or(
      ilike(proveedores.razonSocial, `%${input.busqueda}%`),
      ilike(proveedores.cuit, `%${input.busqueda}%`),
    );
    if (busqueda) {
      condiciones.push(busqueda);
    }
  }
  if (input.condicionIva) {
    condiciones.push(eq(proveedores.condicionIva, input.condicionIva));
  }
  return condiciones.length > 0 ? and(...condiciones) : undefined;
}

/**
 * Lo comprado y lo pagado por proveedor, agregado en SQL. La resta que define
 * el saldo vive en `core`.
 *
 * Sobre monedas: la suma de importes se filtra a pesos con un `filter` y no con
 * un `where`, para que el próximo vencimiento siga mirando todos los
 * comprobantes. Una compra en dólares tiene fecha de vencimiento aunque su
 * importe no entre en el saldo en pesos.
 *
 * A diferencia de ventas, `comprobantes_compra` no tiene estado ni clase: una
 * compra es un documento recibido, sin ciclo de emisión. Por eso acá no hay
 * filtro de estados ni notas de crédito que restar.
 */
function agregadosDe(tx: TenantTx) {
  const comprado = tx
    .select({
      proveedorId: comprobantesCompra.proveedorId,
      total: sql<string | null>`sum(${comprobantesCompra.total}) filter (
        where ${comprobantesCompra.moneda} = 'ARS'
      )`.as("total_comprado"),
      otraMoneda: sql<number>`count(*) filter (
        where ${comprobantesCompra.moneda} <> 'ARS'
      )`.as("otra_moneda"),
      /**
       * Vencimiento de cada comprobante = recepción + su condición de pago.
       * El `filter` es lo que hace que esto sea el PRÓXIMO vencimiento: sin
       * él, `min` devuelve el más viejo de todos, que siempre está vencido en
       * cuanto el proveedor tiene alguna compra con historia.
       *
       * Limitación conocida: no distingue comprobantes ya pagados, porque los
       * pagos se registran contra el proveedor y no contra el comprobante. El
       * saldo a pagar de la fila dice si queda algo por pagar.
       */
      proximo: sql<string | null>`min(
        ${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day'
      ) filter (where
        ${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day'
        >= current_date
      )`.as("proximo_vencimiento"),
    })
    .from(comprobantesCompra)
    .groupBy(comprobantesCompra.proveedorId)
    .as("comprado");

  // Un movimiento hereda la moneda de su cuenta (decisión de modelado 6), así
  // que para quedarse con los pagos en pesos hay que mirar la cuenta.
  const pagado = tx
    .select({
      proveedorId: movimientos.proveedorId,
      total: sum(movimientos.importe).as("total_pagado"),
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(and(eq(movimientos.tipo, "egreso"), eq(cuentas.moneda, "ARS")))
    .groupBy(movimientos.proveedorId)
    .as("pagado");

  return { comprado, pagado };
}

function saldoDe(comprado: string | null, pagado: string | null): Money {
  return saldoCuentaCorriente(
    Money.desdeString(comprado ?? "0", "ARS"),
    Money.desdeString(pagado ?? "0", "ARS"),
  );
}

export async function listarProveedores(
  { tenantId }: Actor,
  input: ProveedoresListar,
): Promise<{ items: ProveedorConSaldo[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const filtro = filtrosDe(input);
    const { comprado, pagado } = agregadosDe(tx);

    const filas = await tx
      .select({
        proveedor: proveedores,
        comprado: comprado.total,
        pagado: pagado.total,
        otraMoneda: comprado.otraMoneda,
        proximo: comprado.proximo,
      })
      .from(proveedores)
      .leftJoin(comprado, eq(comprado.proveedorId, proveedores.id))
      .leftJoin(pagado, eq(pagado.proveedorId, proveedores.id))
      .where(filtro)
      .orderBy(
        ...aplicarOrden(
          {
            razonSocial: proveedores.razonSocial,
            cuit: proveedores.cuit,
            condicionIva: proveedores.condicionIva,
            rubro: proveedores.rubro,
            condicionPagoDias: proveedores.condicionPagoDias,
          },
          input.orden,
          input.direccion,
          proveedores.razonSocial,
        ),
      )
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const items: ProveedorConSaldo[] = filas.map((fila) => ({
      ...fila.proveedor,
      saldoAPagar: saldoDe(fila.comprado, fila.pagado).aStringFiscal(),
      proximoVencimiento: fila.proximo ? String(fila.proximo).slice(0, 10) : null,
      tieneMonedaExtranjera: Number(fila.otraMoneda ?? 0) > 0,
    }));

    const [fila] = await tx.select({ total: count() }).from(proveedores).where(filtro);
    return { items, total: fila?.total ?? 0 };
  });
}

/**
 * Total a pagar y concentración, sobre TODOS los proveedores que matchean los
 * filtros — no sobre la página visible.
 *
 * El riesgo que mide acá es el inverso al de clientes: un proveedor que
 * concentra mucho no es plata que podés no cobrar, es dependencia. Si aumenta,
 * cambia las condiciones o cierra, no hay de dónde comprar.
 */
export async function resumenProveedores(
  actor: Actor,
  input: FiltrosProveedores,
): Promise<ResumenProveedores> {
  return withTenant(actor.tenantId, async (tx) => {
    const { umbralConcentracion } = await leerParametros(tx, actor.tenantId);
    const filtro = filtrosDe(input);
    const { comprado, pagado } = agregadosDe(tx);

    const filas = await tx
      .select({
        razonSocial: proveedores.razonSocial,
        comprado: comprado.total,
        pagado: pagado.total,
        otraMoneda: comprado.otraMoneda,
      })
      .from(proveedores)
      .leftJoin(comprado, eq(comprado.proveedorId, proveedores.id))
      .leftJoin(pagado, eq(pagado.proveedorId, proveedores.id))
      .where(filtro);

    const saldos = filas.map((fila) => ({
      clave: fila.razonSocial,
      importe: saldoDe(fila.comprado, fila.pagado),
    }));

    // Un saldo a favor con un proveedor —le pagaste de más— no resta de lo que
    // le debés al resto.
    const acreedores = saldos.filter((s) => s.importe.esPositivo());
    const concentracion = concentracionMaxima(saldos);

    return {
      totalAPagar: Money.sumarTodos(
        acreedores.map((a) => a.importe),
        "ARS",
      ).aStringFiscal(),
      acreedores: acreedores.length,
      concentracion,
      umbralConcentracion,
      semaforo: semaforoDe(concentracion === null ? null : Number(concentracion.porcentaje), {
        umbral: Number(umbralConcentracion),
        direccion: "menor_es_mejor",
      }),
      hayMonedaExtranjera: filas.some((fila) => Number(fila.otraMoneda ?? 0) > 0),
    };
  });
}

export async function obtenerProveedor(actor: Actor, id: string): Promise<Proveedor | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [proveedor] = await tx.select().from(proveedores).where(eq(proveedores.id, id));
    return proveedor ?? null;
  });
}

function aColumnas(input: ProveedorInput) {
  return {
    razonSocial: input.razonSocial,
    cuit: input.cuit ?? null,
    condicionIva: input.condicionIva,
    rubro: input.rubro ?? null,
    condicionPagoDias: input.condicionPagoDias,
    cbu: input.cbu ?? null,
    aliasCbu: input.aliasCbu ?? null,
    email: input.email ?? null,
    telefono: input.telefono ?? null,
  };
}

export async function crearProveedor(actor: Actor, input: ProveedorInput): Promise<Proveedor> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(proveedores)
      .values({ tenantId: actor.tenantId, ...aColumnas(input) })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear el proveedor");
    }
    await auditar(tx, actor, {
      tabla: "proveedores",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarProveedor(
  actor: Actor,
  { id, datos }: ProveedorActualizar,
): Promise<Proveedor | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(proveedores).where(eq(proveedores.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(proveedores)
      .set(aColumnas(datos))
      .where(and(eq(proveedores.id, id)))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "proveedores",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}
