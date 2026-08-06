import { saldoCuentaCorriente } from "@erp/core/balances";
import { Money } from "@erp/core/money";
import { and, asc, count, eq, ilike, or, sql, sum } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
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
    const filtro = input.busqueda
      ? or(
          ilike(proveedores.razonSocial, `%${input.busqueda}%`),
          ilike(proveedores.cuit, `%${input.busqueda}%`),
        )
      : undefined;

    // Las sumas se agregan en SQL; la resta que define el saldo vive en core.
    const comprado = tx
      .select({
        proveedorId: comprobantesCompra.proveedorId,
        total: sum(comprobantesCompra.total).as("total_comprado"),
        // Vencimiento = recepción + condición de pago pactada en el comprobante.
        proximo: sql<string | null>`min(
          ${comprobantesCompra.fechaRecepcion} + ${comprobantesCompra.condicionPagoDias} * interval '1 day'
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
      .orderBy(asc(proveedores.razonSocial))
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

    const [fila] = await tx.select({ total: count() }).from(proveedores).where(filtro);
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
