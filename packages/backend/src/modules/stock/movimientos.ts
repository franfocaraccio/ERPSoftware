import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import { costoPromedioPonderado } from "@erp/core/stock";
import { desc, eq, sql } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { movimientosStock, productos } from "../../db/schema/stock.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";

export type MovimientoStock = typeof movimientosStock.$inferSelect;
type Tipo = MovimientoStock["tipo"];

export class StockInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "StockInvalidoError";
  }
}

/**
 * Registra una entrada o salida y mantiene al día `stock_actual`. Si es una
 * compra con costo, recalcula el costo del producto por promedio ponderado
 * (`costoPromedioPonderado`, en core).
 *
 * El producto se lee con `FOR UPDATE`: dos compras simultáneas del mismo
 * producto ponderarían contra el mismo stock previo y perderían una.
 */
export async function registrarMovimientoStock(
  tx: TenantTx,
  actor: Actor,
  m: {
    productoId: string;
    tipo: Tipo;
    /** Con signo: positivo entra, negativo sale. */
    cantidad: string;
    fecha?: string;
    costoUnitario?: string | null;
    comprobanteVentaId?: string | null;
    comprobanteCompraId?: string | null;
    motivo?: string | null;
  },
): Promise<MovimientoStock> {
  const [producto] = await tx
    .select()
    .from(productos)
    .where(eq(productos.id, m.productoId))
    .for("update");
  if (!producto) {
    throw new StockInvalidoError("Producto no encontrado");
  }

  // En una venta se guarda el costo de ese momento: si después cambia, la
  // venta ya hecha conserva el costo con el que salió.
  const costo =
    m.costoUnitario ??
    (m.tipo === "venta" || m.tipo === "devolucion" ? producto.costoUnitario : null);

  const [creado] = await tx
    .insert(movimientosStock)
    .values({
      tenantId: actor.tenantId,
      productoId: m.productoId,
      fecha: m.fecha ?? hoyEnArgentina(),
      tipo: m.tipo,
      cantidad: m.cantidad,
      costoUnitario: costo,
      comprobanteVentaId: m.comprobanteVentaId ?? null,
      comprobanteCompraId: m.comprobanteCompraId ?? null,
      motivo: m.motivo ?? null,
      usuarioId: actor.usuarioId,
    })
    .returning();
  if (!creado) {
    throw new Error("No se pudo registrar el movimiento de stock");
  }

  const nuevoCosto =
    m.tipo === "compra" && m.costoUnitario
      ? costoPromedioPonderado(
          producto.stockActual,
          producto.costoUnitario ? Money.desdeString(producto.costoUnitario, "ARS") : null,
          m.cantidad,
          Money.desdeString(m.costoUnitario, "ARS"),
        ).aStringFiscal()
      : producto.costoUnitario;

  await tx
    .update(productos)
    .set({
      // Cantidades, no plata: la suma la hace la base con `numeric`, exacta.
      stockActual: sql`${productos.stockActual} + ${m.cantidad}::numeric`,
      costoUnitario: nuevoCosto,
    })
    .where(eq(productos.id, m.productoId));

  return creado;
}

export async function movimientosDeProducto(
  actor: Actor,
  productoId: string,
): Promise<MovimientoStock[]> {
  return withTenant(actor.tenantId, (tx) =>
    tx
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.productoId, productoId))
      .orderBy(desc(movimientosStock.fecha), desc(movimientosStock.creado))
      .limit(100),
  );
}

/**
 * Un ajuste manual: la única forma de corregir el stock a mano, con su motivo
 * (un conteo, una rotura, una pérdida). Queda en el audit log.
 */
export async function ajustarStock(
  actor: Actor,
  input: { productoId: string; cantidad: string; motivo: string; fecha?: string },
): Promise<MovimientoStock> {
  return withTenant(actor.tenantId, async (tx) => {
    const movimiento = await registrarMovimientoStock(tx, actor, {
      productoId: input.productoId,
      tipo: "ajuste",
      cantidad: input.cantidad,
      motivo: input.motivo,
      ...(input.fecha ? { fecha: input.fecha } : {}),
    });
    await auditar(tx, actor, {
      tabla: "movimientos_stock",
      registroId: movimiento.id,
      accion: "alta",
      detalle: { despues: movimiento },
    });
    return movimiento;
  });
}
