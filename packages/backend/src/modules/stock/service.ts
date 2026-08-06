import { Money } from "@erp/core/money";
import { type EstadoStock, estadoStock, margenBruto, valorizacion } from "@erp/core/stock";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { productos } from "../../db/schema/stock.js";
import { withTenant } from "../../db/tenant-db.js";
import type { ProductoActualizar, ProductoInput, ProductosListar } from "./schema.js";

export type Producto = typeof productos.$inferSelect;

/** Estado, valorización y margen son derivados: se calculan al leer. */
export interface ProductoConDerivados extends Producto {
  proveedorNombre: string | null;
  estado: EstadoStock;
  valorizacion: string;
  margenBruto: string | null;
}

function conDerivados(producto: Producto, proveedorNombre: string | null): ProductoConDerivados {
  const moneda = producto.moneda;
  const costo = producto.costoUnitario ? Money.desdeString(producto.costoUnitario, moneda) : null;
  const precio = producto.precioVenta ? Money.desdeString(producto.precioVenta, moneda) : null;
  return {
    ...producto,
    proveedorNombre,
    estado: estadoStock(producto.stockActual, producto.stockMinimo),
    valorizacion: valorizacion(producto.stockActual, costo).aStringFiscal(),
    margenBruto: margenBruto(precio, costo),
  };
}

export async function listarProductos(
  { tenantId }: Actor,
  input: ProductosListar,
): Promise<{ items: ProductoConDerivados[]; total: number; valorizacionTotal: string }> {
  return withTenant(tenantId, async (tx) => {
    const condiciones = [];
    if (input.busqueda) {
      const coincide = or(
        ilike(productos.sku, `%${input.busqueda}%`),
        ilike(productos.descripcion, `%${input.busqueda}%`),
      );
      if (coincide) {
        condiciones.push(coincide);
      }
    }
    if (input.soloReponer) {
      // El filtro se replica en SQL para no traer todo y descartar en memoria;
      // el criterio canónico sigue siendo estadoStock() de core.
      condiciones.push(sql`${productos.stockActual} <= ${productos.stockMinimo}`);
    }
    const filtro = condiciones.length > 0 ? and(...condiciones) : undefined;

    const filas = await tx
      .select({ producto: productos, proveedorNombre: proveedores.razonSocial })
      .from(productos)
      .leftJoin(proveedores, eq(proveedores.id, productos.proveedorPrincipalId))
      .where(filtro)
      .orderBy(asc(productos.sku))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const items = filas.map(({ producto, proveedorNombre }) =>
      conDerivados(producto, proveedorNombre),
    );

    const [fila] = await tx.select({ total: count() }).from(productos).where(filtro);

    // Capital inmovilizado de la página: suma de las valorizaciones ya redondeadas.
    const valorizacionTotal = Money.sumarTodos(
      items.map((i) => Money.desdeString(i.valorizacion, "ARS")),
      "ARS",
    ).aStringFiscal();

    return { items, total: fila?.total ?? 0, valorizacionTotal };
  });
}

export async function obtenerProducto(actor: Actor, id: string): Promise<Producto | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [producto] = await tx.select().from(productos).where(eq(productos.id, id));
    return producto ?? null;
  });
}

function aColumnas(input: ProductoInput) {
  return {
    sku: input.sku,
    descripcion: input.descripcion,
    categoria: input.categoria ?? null,
    costoUnitario: input.costoUnitario ?? null,
    precioVenta: input.precioVenta ?? null,
    moneda: input.moneda,
    stockActual: input.stockActual,
    stockMinimo: input.stockMinimo,
    proveedorPrincipalId: input.proveedorPrincipalId ?? null,
  };
}

export async function crearProducto(actor: Actor, input: ProductoInput): Promise<Producto> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(productos)
      .values({ tenantId: actor.tenantId, ...aColumnas(input) })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear el producto");
    }
    await auditar(tx, actor, {
      tabla: "productos",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarProducto(
  actor: Actor,
  { id, datos }: ProductoActualizar,
): Promise<Producto | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(productos).where(eq(productos.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(productos)
      .set(aColumnas(datos))
      .where(eq(productos.id, id))
      .returning();
    if (!despues) {
      return null;
    }
    await auditar(tx, actor, {
      tabla: "productos",
      registroId: id,
      accion: "modificacion",
      // El stock impacta la valorización: el detalle deja el antes y el después.
      detalle: { antes, despues },
    });
    return despues;
  });
}
