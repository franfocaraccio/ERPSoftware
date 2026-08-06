import {
  attemptTransition,
  calcularComprobante,
  type EstadoComprobante,
  type EventoComprobante,
  esEditable,
  eventosDisponibles,
  type LetraComprobante,
  letraPermitida,
} from "@erp/core/invoicing";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta, itemsComprobanteVenta } from "../../db/schema/facturacion.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { withTenant } from "../../db/tenant-db.js";
import type {
  CompraActualizar,
  CompraInput,
  ComprasListar,
  VentaActualizar,
  VentaInput,
  VentasListar,
  VentaTransicion,
} from "./schema.js";

export type ComprobanteVenta = typeof comprobantesVenta.$inferSelect;
export type ItemComprobante = typeof itemsComprobanteVenta.$inferSelect;
export type ComprobanteCompra = typeof comprobantesCompra.$inferSelect;

export interface VentaConDerivados extends ComprobanteVenta {
  clienteRazonSocial: string;
  /** Para que el frontend renderice acciones sin conocer la máquina de estados. */
  availableEvents: EventoComprobante[];
  editable: boolean;
}

export class ComprobanteInmutableError extends Error {
  constructor() {
    super("Un comprobante que salió de borrador no se puede modificar");
    this.name = "ComprobanteInmutableError";
  }
}

export class TransicionInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "TransicionInvalidaError";
  }
}

function conDerivados(venta: ComprobanteVenta, clienteRazonSocial: string): VentaConDerivados {
  const estado = venta.estado as EstadoComprobante;
  return {
    ...venta,
    clienteRazonSocial,
    availableEvents: eventosDisponibles(estado),
    editable: esEditable(estado),
  };
}

// --- Ventas ---

export async function listarVentas(
  { tenantId }: Actor,
  input: VentasListar,
): Promise<{ items: VentaConDerivados[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const condiciones = [];
    if (input.estado) {
      condiciones.push(eq(comprobantesVenta.estado, input.estado));
    }
    if (input.clienteId) {
      condiciones.push(eq(comprobantesVenta.clienteId, input.clienteId));
    }
    const filtro = condiciones.length > 0 ? and(...condiciones) : undefined;

    const filas = await tx
      .select({ venta: comprobantesVenta, cliente: clientes.razonSocial })
      .from(comprobantesVenta)
      .innerJoin(clientes, eq(clientes.id, comprobantesVenta.clienteId))
      .where(filtro)
      .orderBy(desc(comprobantesVenta.fechaEmision), desc(comprobantesVenta.createdAt))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const [fila] = await tx.select({ total: count() }).from(comprobantesVenta).where(filtro);

    return {
      items: filas.map(({ venta, cliente }) => conDerivados(venta, cliente)),
      total: fila?.total ?? 0,
    };
  });
}

export async function obtenerVenta(
  actor: Actor,
  id: string,
): Promise<(VentaConDerivados & { items: ItemComprobante[] }) | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [fila] = await tx
      .select({ venta: comprobantesVenta, cliente: clientes.razonSocial })
      .from(comprobantesVenta)
      .innerJoin(clientes, eq(clientes.id, comprobantesVenta.clienteId))
      .where(eq(comprobantesVenta.id, id));
    if (!fila) {
      return null;
    }
    const items = await tx
      .select()
      .from(itemsComprobanteVenta)
      .where(eq(itemsComprobanteVenta.comprobanteId, id))
      .orderBy(asc(itemsComprobanteVenta.orden));
    return { ...conDerivados(fila.venta, fila.cliente), items };
  });
}

/** La letra la determina la condición IVA del cliente, no el usuario. */
async function resolverCliente(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  clienteId: string,
): Promise<{ condicionIva: string; letra: LetraComprobante }> {
  const [cliente] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
  if (!cliente) {
    throw new Error("Cliente no encontrado");
  }
  return {
    condicionIva: cliente.condicionIva,
    // TODO(fase 3): la condición del emisor sale de la configuración del tenant.
    letra: letraPermitida("responsable_inscripto", cliente.condicionIva),
  };
}

export async function crearVenta(actor: Actor, input: VentaInput): Promise<ComprobanteVenta> {
  return withTenant(actor.tenantId, async (tx) => {
    const cliente = await resolverCliente(tx, input.clienteId);
    // Los totales los calcula core a partir de los ítems: nunca llegan del cliente.
    const calculo = calcularComprobante(input.items, input.moneda);

    const [creado] = await tx
      .insert(comprobantesVenta)
      .values({
        tenantId: actor.tenantId,
        clase: input.clase,
        letra: cliente.letra,
        puntoVenta: input.puntoVenta,
        numero: input.numero ?? null,
        clienteId: input.clienteId,
        fechaEmision: input.fechaEmision,
        condicionIvaReceptor: cliente.condicionIva as never,
        condicionVentaDias: input.condicionVentaDias,
        moneda: input.moneda,
        neto: calculo.neto.aStringFiscal(),
        iva: calculo.iva.aStringFiscal(),
        total: calculo.total.aStringFiscal(),
      })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear el comprobante");
    }

    await tx.insert(itemsComprobanteVenta).values(
      input.items.map((item, orden) => ({
        tenantId: actor.tenantId,
        comprobanteId: creado.id,
        productoId: item.productoId ?? null,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        alicuotaIva: item.alicuotaIva,
        orden,
      })),
    );

    await auditar(tx, actor, {
      tabla: "comprobantes_venta",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarVenta(
  actor: Actor,
  { id, datos }: VentaActualizar,
): Promise<ComprobanteVenta | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(comprobantesVenta).where(eq(comprobantesVenta.id, id));
    if (!antes) {
      return null;
    }
    // Regla fiscal: fuera de borrador el comprobante es inmutable.
    if (!esEditable(antes.estado as EstadoComprobante)) {
      throw new ComprobanteInmutableError();
    }

    const cliente = await resolverCliente(tx, datos.clienteId);
    const calculo = calcularComprobante(datos.items, datos.moneda);

    const [despues] = await tx
      .update(comprobantesVenta)
      .set({
        clase: datos.clase,
        letra: cliente.letra,
        puntoVenta: datos.puntoVenta,
        numero: datos.numero ?? null,
        clienteId: datos.clienteId,
        fechaEmision: datos.fechaEmision,
        condicionIvaReceptor: cliente.condicionIva as never,
        condicionVentaDias: datos.condicionVentaDias,
        moneda: datos.moneda,
        neto: calculo.neto.aStringFiscal(),
        iva: calculo.iva.aStringFiscal(),
        total: calculo.total.aStringFiscal(),
      })
      .where(eq(comprobantesVenta.id, id))
      .returning();
    if (!despues) {
      return null;
    }

    // Los ítems se reemplazan por completo: es un borrador.
    await tx.delete(itemsComprobanteVenta).where(eq(itemsComprobanteVenta.comprobanteId, id));
    await tx.insert(itemsComprobanteVenta).values(
      datos.items.map((item, orden) => ({
        tenantId: actor.tenantId,
        comprobanteId: id,
        productoId: item.productoId ?? null,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        alicuotaIva: item.alicuotaIva,
        orden,
      })),
    );

    await auditar(tx, actor, {
      tabla: "comprobantes_venta",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}

/**
 * Cambia el estado del comprobante usando la función de transición pura.
 * En Fase 3 la emisión real contra ARCA se engancha acá.
 */
export async function transicionarVenta(
  actor: Actor,
  { id, evento }: VentaTransicion,
): Promise<ComprobanteVenta | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(comprobantesVenta).where(eq(comprobantesVenta.id, id));
    if (!antes) {
      return null;
    }

    const resultado = attemptTransition(antes.estado as EstadoComprobante, evento);
    if (!resultado.ok) {
      throw new TransicionInvalidaError(resultado.motivo);
    }

    const [despues] = await tx
      .update(comprobantesVenta)
      .set({ estado: resultado.siguiente })
      .where(eq(comprobantesVenta.id, id))
      .returning();
    if (!despues) {
      return null;
    }

    await auditar(tx, actor, {
      tabla: "comprobantes_venta",
      registroId: id,
      accion: "transicion_estado",
      detalle: { evento, desde: antes.estado, hasta: resultado.siguiente },
    });
    return despues;
  });
}

// --- Compras ---

export interface CompraConProveedor extends ComprobanteCompra {
  proveedorRazonSocial: string;
}

export async function listarCompras(
  { tenantId }: Actor,
  input: ComprasListar,
): Promise<{ items: CompraConProveedor[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const filtro = input.proveedorId
      ? eq(comprobantesCompra.proveedorId, input.proveedorId)
      : undefined;

    const filas = await tx
      .select({ compra: comprobantesCompra, proveedor: proveedores.razonSocial })
      .from(comprobantesCompra)
      .innerJoin(proveedores, eq(proveedores.id, comprobantesCompra.proveedorId))
      .where(filtro)
      .orderBy(desc(comprobantesCompra.fechaRecepcion))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const [fila] = await tx.select({ total: count() }).from(comprobantesCompra).where(filtro);

    return {
      items: filas.map(({ compra, proveedor }) => ({
        ...compra,
        proveedorRazonSocial: proveedor,
      })),
      total: fila?.total ?? 0,
    };
  });
}

export async function obtenerCompra(actor: Actor, id: string): Promise<ComprobanteCompra | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [compra] = await tx
      .select()
      .from(comprobantesCompra)
      .where(eq(comprobantesCompra.id, id));
    return compra ?? null;
  });
}

function aColumnasCompra(input: CompraInput) {
  return {
    proveedorId: input.proveedorId,
    letra: input.letra ?? null,
    numeroCompleto: input.numeroCompleto ?? null,
    fechaEmision: input.fechaEmision ?? null,
    fechaRecepcion: input.fechaRecepcion,
    condicionPagoDias: input.condicionPagoDias,
    concepto: input.concepto ?? null,
    moneda: input.moneda,
    neto: input.neto,
    iva: input.iva,
    total: input.total,
  };
}

export async function crearCompra(actor: Actor, input: CompraInput): Promise<ComprobanteCompra> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creada] = await tx
      .insert(comprobantesCompra)
      .values({ tenantId: actor.tenantId, ...aColumnasCompra(input) })
      .returning();
    if (!creada) {
      throw new Error("No se pudo registrar la compra");
    }
    await auditar(tx, actor, {
      tabla: "comprobantes_compra",
      registroId: creada.id,
      accion: "alta",
      detalle: { despues: creada },
    });
    return creada;
  });
}

export async function actualizarCompra(
  actor: Actor,
  { id, datos }: CompraActualizar,
): Promise<ComprobanteCompra | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(comprobantesCompra).where(eq(comprobantesCompra.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(comprobantesCompra)
      .set(aColumnasCompra(datos))
      .where(eq(comprobantesCompra.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "comprobantes_compra",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}
