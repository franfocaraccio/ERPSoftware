import { saldoCuentaCorriente } from "@erp/core/balances";
import { Money } from "@erp/core/money";
import { and, count, eq, ilike, or, type SQL, sql, sum } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { aplicarOrden } from "../_comunes/orden.js";
import type { ProveedorActualizar, ProveedoresListar, ProveedorInput } from "./schema.js";

export type Proveedor = typeof proveedores.$inferSelect;

/** El saldo a pagar no se persiste: se calcula al leer. */
export interface ProveedorConSaldo extends Proveedor {
  saldoAPagar: string;
  proximoVencimiento: string | null;
}

export async function listarProveedores(
  { tenantId }: Actor,
  input: ProveedoresListar,
): Promise<{ items: ProveedorConSaldo[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
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
    // Las sumas se agregan en SQL; la resta que define el saldo vive en core.
    const comprado = tx
      .select({
        proveedorId: comprobantesCompra.proveedorId,
        total: sum(comprobantesCompra.total).as("total_comprado"),
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

    const pagado = tx
      .select({
        proveedorId: movimientos.proveedorId,
        total: sum(movimientos.importe).as("total_pagado"),
      })
      .from(movimientos)
      .where(eq(movimientos.tipo, "egreso"))
      .groupBy(movimientos.proveedorId)
      .as("pagado");

    // El rango filtra por próximo vencimiento, que es una columna calculada del
    // subquery, no del proveedor: por eso el filtro se arma acá, ya con el join
    // hecho. Un proveedor sin vencimientos futuros queda afuera, que es lo
    // correcto para "los que me vencen entre estas dos fechas".
    if (input.desde) {
      condiciones.push(sql`${comprado.proximo} >= ${input.desde}::date`);
    }
    if (input.hasta) {
      condiciones.push(sql`${comprado.proximo} <= ${input.hasta}::date`);
    }
    const filtro = condiciones.length > 0 ? and(...condiciones) : undefined;

    const filas = await tx
      .select({
        proveedor: proveedores,
        comprado: comprado.total,
        pagado: pagado.total,
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

    const items = filas.map(({ proveedor, comprado: c, pagado: p, proximo }) => ({
      ...proveedor,
      saldoAPagar: saldoCuentaCorriente(
        Money.desdeString(c ?? "0", "ARS"),
        Money.desdeString(p ?? "0", "ARS"),
      ).aStringFiscal(),
      proximoVencimiento: proximo ? String(proximo).slice(0, 10) : null,
    }));

    // El mismo join que el listado: el filtro puede referirse a `comprado`, y
    // sin la unión el conteo no compilaría — y si compilara, mentiría.
    const [fila] = await tx
      .select({ total: count() })
      .from(proveedores)
      .leftJoin(comprado, eq(comprado.proveedorId, proveedores.id))
      .where(filtro);
    return { items, total: fila?.total ?? 0 };
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
