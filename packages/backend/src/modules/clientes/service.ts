import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { clientes } from "../../db/schema/clientes.js";
import { withTenant } from "../../db/tenant-db.js";
import type { ClienteActualizar, ClienteInput, ClientesListar } from "./schema.js";

export type Cliente = typeof clientes.$inferSelect;

interface Actor {
  tenantId: string;
  usuarioId: string;
}

export async function listarClientes(
  { tenantId }: Actor,
  input: ClientesListar,
): Promise<{ items: Cliente[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const filtro = input.busqueda
      ? or(
          ilike(clientes.razonSocial, `%${input.busqueda}%`),
          ilike(clientes.cuit, `%${input.busqueda}%`),
        )
      : undefined;

    const items = await tx
      .select()
      .from(clientes)
      .where(filtro)
      .orderBy(asc(clientes.razonSocial))
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const [fila] = await tx.select({ total: count() }).from(clientes).where(filtro);
    return { items, total: fila?.total ?? 0 };
  });
}

export async function obtenerCliente(actor: Actor, id: string): Promise<Cliente | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [cliente] = await tx.select().from(clientes).where(eq(clientes.id, id));
    return cliente ?? null;
  });
}

export async function crearCliente(actor: Actor, input: ClienteInput): Promise<Cliente> {
  return withTenant(actor.tenantId, async (tx) => {
    const [creado] = await tx
      .insert(clientes)
      .values({
        tenantId: actor.tenantId,
        razonSocial: input.razonSocial,
        cuit: input.cuit ?? null,
        condicionIva: input.condicionIva,
        email: input.email ?? null,
        telefono: input.telefono ?? null,
        direccion: input.direccion ?? null,
        limiteCredito: input.limiteCredito ?? null,
      })
      .returning();
    if (!creado) {
      throw new Error("No se pudo crear el cliente");
    }
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "clientes",
      registroId: creado.id,
      accion: "alta",
      detalle: { despues: creado },
    });
    return creado;
  });
}

export async function actualizarCliente(
  actor: Actor,
  { id, datos }: ClienteActualizar,
): Promise<Cliente | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [antes] = await tx.select().from(clientes).where(eq(clientes.id, id));
    if (!antes) {
      return null;
    }
    const [despues] = await tx
      .update(clientes)
      .set({
        razonSocial: datos.razonSocial,
        cuit: datos.cuit ?? null,
        condicionIva: datos.condicionIva,
        email: datos.email ?? null,
        telefono: datos.telefono ?? null,
        direccion: datos.direccion ?? null,
        limiteCredito: datos.limiteCredito ?? null,
        estado: datos.estado,
      })
      .where(and(eq(clientes.id, id)))
      .returning();
    if (!despues) {
      return null;
    }
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      usuarioId: actor.usuarioId,
      tabla: "clientes",
      registroId: id,
      accion: "modificacion",
      detalle: { antes, despues },
    });
    return despues;
  });
}
