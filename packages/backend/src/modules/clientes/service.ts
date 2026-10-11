import { saldoCuentaCorriente } from "@erp/core/balances";
import { type Concentracion, concentracionMaxima, type Semaforo, semaforoDe } from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import { and, count, eq, ilike, inArray, or, type SQL, sql, sum } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { aplicarOrden } from "../_comunes/orden.js";
import { leerParametros } from "../parametros/service.js";
import type { ClienteActualizar, ClienteInput, ClientesListar } from "./schema.js";

export type Cliente = typeof clientes.$inferSelect;

/** El saldo no se persiste: se calcula al leer, igual que en proveedores. */
export interface ClienteConSaldo extends Cliente {
  /** Lo que el cliente debe, en pesos. Negativo = tiene saldo a favor. */
  saldo: string;
  proximoVencimiento: string | null;
  /**
   * Tiene comprobantes en otra moneda, que NO entran en `saldo`. Mezclar pesos
   * y dólares en un solo número sería mentir; la pantalla lo avisa en vez de
   * sumarlos.
   */
  tieneMonedaExtranjera: boolean;
}

export interface ResumenClientes {
  /** Suma de los saldos deudores, en pesos. Los saldos a favor no restan. */
  totalACobrar: string;
  /** Cuántos clientes tienen saldo deudor. */
  deudores: number;
  concentracion: Concentracion | null;
  umbralConcentracion: string;
  /** "alerta" cuando el cliente más grande supera el umbral de la empresa. */
  semaforo: Semaforo;
  /** Hay algún cliente con comprobantes fuera de pesos. */
  hayMonedaExtranjera: boolean;
}

/**
 * Estados de comprobante que son deuda real.
 *
 * Un borrador todavía no se le reclamó a nadie y un rechazado ya no se
 * reclama. Proveedores no necesita este filtro porque las compras no tienen
 * máquina de estados.
 */
const ESTADOS_QUE_DEBEN = ["enviada", "aprobada"] as const;

interface Actor {
  tenantId: string;
  usuarioId: string;
}

/** Los filtros de la pantalla. Compartidos por el listado y el resumen de arriba. */
export type FiltrosClientes = Pick<ClientesListar, "busqueda" | "condicionIva" | "estado">;

function filtrosDe(input: FiltrosClientes): SQL | undefined {
  // Los tres filtros se combinan. `condicionIva` y `estado` llegaban al
  // service y no se usaban en ninguna condición: la pantalla ofrecía los dos
  // desplegables y elegir cualquiera de ellos no cambiaba nada.
  const condiciones: SQL[] = [];
  if (input.busqueda) {
    const busqueda = or(
      ilike(clientes.razonSocial, `%${input.busqueda}%`),
      ilike(clientes.cuit, `%${input.busqueda}%`),
    );
    if (busqueda) {
      condiciones.push(busqueda);
    }
  }
  if (input.condicionIva) {
    condiciones.push(eq(clientes.condicionIva, input.condicionIva));
  }
  if (input.estado) {
    condiciones.push(eq(clientes.estado, input.estado));
  }
  return condiciones.length > 0 ? and(...condiciones) : undefined;
}

/**
 * Lo facturado y lo cobrado por cliente, agregado en SQL. La resta que define
 * el saldo vive en `core`.
 *
 * Sobre monedas: la suma de importes se filtra a pesos con un `filter` y no con
 * un `where`, para que el próximo vencimiento siga mirando todos los
 * comprobantes. Una factura en dólares tiene fecha de vencimiento aunque su
 * importe no entre en el saldo en pesos.
 *
 * Sobre notas de crédito: restan en vez de sumar. Son el único mecanismo de
 * corrección de un comprobante con CAE, así que si sumaran, emitir una nota de
 * crédito aumentaría la deuda del cliente al que se le está devolviendo plata.
 * Las notas de débito sí suman, como una factura.
 */
function agregadosDe(tx: TenantTx) {
  const facturado = tx
    .select({
      clienteId: comprobantesVenta.clienteId,
      total: sql<string | null>`sum(
        case when ${comprobantesVenta.clase} = 'nota_credito'
          then -${comprobantesVenta.total}
          else ${comprobantesVenta.total}
        end
      ) filter (
        where ${comprobantesVenta.moneda} = 'ARS'
      )`.as("total_facturado"),
      otraMoneda: sql<number>`count(*) filter (
        where ${comprobantesVenta.moneda} <> 'ARS'
      )`.as("otra_moneda"),
      /**
       * El `filter` es lo que hace que esto sea el PRÓXIMO vencimiento: sin él
       * `min` devuelve el más viejo, que siempre está vencido en cuanto el
       * cliente tiene alguna factura con historia.
       */
      proximo: sql<string | null>`min(
        ${comprobantesVenta.fechaEmision} + ${comprobantesVenta.condicionVentaDias} * interval '1 day'
      ) filter (where
        ${comprobantesVenta.clase} <> 'nota_credito'
        and ${comprobantesVenta.fechaEmision} + ${comprobantesVenta.condicionVentaDias} * interval '1 day'
        >= current_date
      )`.as("proximo_vencimiento"),
    })
    .from(comprobantesVenta)
    .where(inArray(comprobantesVenta.estado, [...ESTADOS_QUE_DEBEN]))
    .groupBy(comprobantesVenta.clienteId)
    .as("facturado");

  // Un movimiento hereda la moneda de su cuenta (decisión de modelado 6), así
  // que para quedarse con los cobros en pesos hay que mirar la cuenta.
  const cobrado = tx
    .select({
      clienteId: movimientos.clienteId,
      total: sum(movimientos.importe).as("total_cobrado"),
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(and(eq(movimientos.tipo, "ingreso"), eq(cuentas.moneda, "ARS")))
    .groupBy(movimientos.clienteId)
    .as("cobrado");

  return { facturado, cobrado };
}

function saldoDe(facturado: string | null, cobrado: string | null): Money {
  return saldoCuentaCorriente(
    Money.desdeString(facturado ?? "0", "ARS"),
    Money.desdeString(cobrado ?? "0", "ARS"),
  );
}

export async function listarClientes(
  { tenantId }: Actor,
  input: ClientesListar,
): Promise<{ items: ClienteConSaldo[]; total: number }> {
  return withTenant(tenantId, async (tx) => {
    const filtro = filtrosDe(input);
    const { facturado, cobrado } = agregadosDe(tx);

    const filas = await tx
      .select({
        cliente: clientes,
        facturado: facturado.total,
        cobrado: cobrado.total,
        otraMoneda: facturado.otraMoneda,
        proximo: facturado.proximo,
      })
      .from(clientes)
      .leftJoin(facturado, eq(facturado.clienteId, clientes.id))
      .leftJoin(cobrado, eq(cobrado.clienteId, clientes.id))
      .where(filtro)
      .orderBy(
        ...aplicarOrden(
          {
            razonSocial: clientes.razonSocial,
            cuit: clientes.cuit,
            condicionIva: clientes.condicionIva,
            limiteCredito: clientes.limiteCredito,
            estado: clientes.estado,
          },
          input.orden,
          input.direccion,
          clientes.razonSocial,
        ),
      )
      .limit(input.tamanoPagina)
      .offset((input.pagina - 1) * input.tamanoPagina);

    const items: ClienteConSaldo[] = filas.map((fila) => ({
      ...fila.cliente,
      saldo: saldoDe(fila.facturado, fila.cobrado).aStringFiscal(),
      proximoVencimiento: fila.proximo ? String(fila.proximo).slice(0, 10) : null,
      tieneMonedaExtranjera: Number(fila.otraMoneda ?? 0) > 0,
    }));

    const [fila] = await tx.select({ total: count() }).from(clientes).where(filtro);
    return { items, total: fila?.total ?? 0 };
  });
}

/**
 * Total a cobrar y concentración, sobre TODOS los clientes que matchean los
 * filtros — no sobre la página visible. Calcularlo sobre la página daría un
 * porcentaje distinto en cada paso del paginador, que es exactamente el error
 * que esta función existe para evitar.
 */
export async function resumenClientes(
  actor: Actor,
  input: FiltrosClientes,
): Promise<ResumenClientes> {
  return withTenant(actor.tenantId, async (tx) => {
    const { umbralConcentracion } = await leerParametros(tx, actor.tenantId);
    const filtro = filtrosDe(input);
    const { facturado, cobrado } = agregadosDe(tx);

    const filas = await tx
      .select({
        razonSocial: clientes.razonSocial,
        facturado: facturado.total,
        cobrado: cobrado.total,
        otraMoneda: facturado.otraMoneda,
      })
      .from(clientes)
      .leftJoin(facturado, eq(facturado.clienteId, clientes.id))
      .leftJoin(cobrado, eq(cobrado.clienteId, clientes.id))
      .where(filtro);

    const saldos = filas.map((fila) => ({
      clave: fila.razonSocial,
      importe: saldoDe(fila.facturado, fila.cobrado),
    }));

    // Los saldos a favor no restan del total a cobrar: que un cliente haya
    // pagado de más no es plata que entre por otro lado.
    const deudores = saldos.filter((s) => s.importe.esPositivo());
    const concentracion = concentracionMaxima(saldos);

    return {
      totalACobrar: Money.sumarTodos(
        deudores.map((d) => d.importe),
        "ARS",
      ).aStringFiscal(),
      deudores: deudores.length,
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
