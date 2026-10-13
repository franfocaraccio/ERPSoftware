import { enMora, saldoCuentaCorriente } from "@erp/core/balances";
import { hoyEnArgentina } from "@erp/core/dates";
import { type Concentracion, concentracionMaxima, type Semaforo, semaforoDe } from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import { and, count, eq, ilike, inArray, or, type SQL, sql, sum } from "drizzle-orm";
import { auditLog } from "../../db/schema/auditoria.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { ESTADOS_QUE_DEBEN, totalConSigno } from "../_comunes/comprobantes.js";
import { aplicarOrden } from "../_comunes/orden.js";
import {
  primerVencimientoImpago,
  type SaldosCuentaCorriente,
  saldosCuentaCorriente,
} from "../cuenta-corriente/saldos.js";
import { leerParametros } from "../parametros/service.js";
import type { ClienteActualizar, ClienteInput, ClientesListar } from "./schema.js";

export type Cliente = typeof clientes.$inferSelect;

/** El saldo no se persiste: se calcula al leer, igual que en proveedores. */
export interface ClienteConSaldo extends Cliente {
  /** Lo que el cliente debe, en pesos. Negativo = tiene saldo a favor. */
  saldo: string;
  /** Vencimiento de la deuda impaga más vieja. Puede estar en el pasado. */
  proximoVencimiento: string | null;
  /**
   * Tiene deuda vencida hace más días que el umbral de Parámetros. Calculado:
   * no depende del `estado` guardado.
   */
  enMora: boolean;
  /** El saldo supera el límite de crédito. Se avisa; no bloquea nada. */
  excedeLimite: boolean;
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

interface Actor {
  tenantId: string;
  usuarioId: string;
}

/** Los filtros de la pantalla. Compartidos por el listado y el resumen de arriba. */
export type FiltrosClientes = Pick<ClientesListar, "busqueda" | "condicionIva" | "estado">;

function filtrosDe(input: FiltrosClientes, moraIds?: ReadonlySet<string>): SQL | undefined {
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
  if (input.estado === "en_mora") {
    // La mora no es una columna: es el conjunto que calculó la cuenta corriente.
    const ids = [...(moraIds ?? [])];
    condiciones.push(ids.length > 0 ? inArray(clientes.id, ids) : sql`false`);
  } else if (input.estado) {
    condiciones.push(eq(clientes.estado, input.estado));
  }
  return condiciones.length > 0 ? and(...condiciones) : undefined;
}

/**
 * Los clientes en mora: con algo impago vencido hace más días que el umbral
 * de la empresa. Sale de la misma cuenta corriente que el saldo.
 */
function clientesEnMora(cc: SaldosCuentaCorriente, umbralDias: number): Set<string> {
  const hoy = hoyEnArgentina();
  const porCliente = new Map<string, typeof cc.comprobantes>();
  for (const c of cc.comprobantes) {
    porCliente.set(c.contraparteId, [...(porCliente.get(c.contraparteId) ?? []), c]);
  }
  return new Set(
    [...porCliente.entries()]
      .filter(([, propios]) => enMora(propios, hoy, umbralDias))
      .map(([id]) => id),
  );
}

/**
 * Lo facturado y lo cobrado por cliente, agregado en SQL. La resta que define
 * el saldo vive en `core`.
 *
 * Sobre monedas: la suma de importes se filtra a pesos con un `filter` y no con
 * un `where`, para poder contar además los comprobantes en otra moneda y
 * avisar que existen.
 *
 * Sobre notas de crédito: restan en vez de sumar, y el por qué está en
 * `totalConSigno`, que es de donde sale el signo.
 *
 * El vencimiento que muestra la lista no sale de acá: es el de la deuda
 * impaga más vieja, y se calcula aparte (`vencimientoImpagoClientes`).
 */
function agregadosDe(tx: TenantTx) {
  const facturado = tx
    .select({
      clienteId: comprobantesVenta.clienteId,
      total: sql<string | null>`sum(${totalConSigno()}) filter (
        where ${comprobantesVenta.moneda} = 'ARS'
      )`.as("total_facturado"),
      otraMoneda: sql<number>`count(*) filter (
        where ${comprobantesVenta.moneda} <> 'ARS'
      )`.as("otra_moneda"),
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
    const { umbralMoraDias } = await leerParametros(tx, tenantId);
    const cc = await saldosCuentaCorriente(tx, "ventas");
    const moraIds = clientesEnMora(cc, umbralMoraDias);
    const filtro = filtrosDe(input, moraIds);
    const { facturado, cobrado } = agregadosDe(tx);

    const filas = await tx
      .select({
        cliente: clientes,
        facturado: facturado.total,
        cobrado: cobrado.total,
        otraMoneda: facturado.otraMoneda,
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

    const vencimientos = primerVencimientoImpago(cc.comprobantes);
    const items: ClienteConSaldo[] = filas.map((fila) => {
      const saldo = saldoDe(fila.facturado, fila.cobrado);
      return {
        ...fila.cliente,
        saldo: saldo.aStringFiscal(),
        proximoVencimiento: vencimientos.get(fila.cliente.id) ?? null,
        enMora: moraIds.has(fila.cliente.id),
        excedeLimite:
          fila.cliente.limiteCredito !== null &&
          saldo.mayorQue(Money.desdeString(fila.cliente.limiteCredito, "ARS")),
        tieneMonedaExtranjera: Number(fila.otraMoneda ?? 0) > 0,
      };
    });

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
    const { umbralConcentracion, umbralMoraDias } = await leerParametros(tx, actor.tenantId);
    const moraIds =
      input.estado === "en_mora"
        ? clientesEnMora(await saldosCuentaCorriente(tx, "ventas"), umbralMoraDias)
        : undefined;
    const filtro = filtrosDe(input, moraIds);
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
