import { hoyEnArgentina } from "@erp/core/dates";
import { Money } from "@erp/core/money";
import { inArray, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { withTenant } from "../../db/tenant-db.js";
import { datosDeComprobantes } from "./fichas.js";
import { type Lado, saldosCuentaCorriente } from "./saldos.js";

const ARS = "ARS" as const;

export interface ComprobantePendiente {
  id: string;
  contraparteId: string;
  contraparte: string;
  comprobante: string;
  fecha: string;
  vencimiento: string;
  total: string;
  pendiente: string;
  estado: "pendiente" | "parcial" | "cobrada" | "vencida";
  /** Días desde el vencimiento; 0 si todavía no venció. */
  diasDeAtraso: number;
}

export interface PendientesPorContraparte {
  contraparteId: string;
  nombre: string;
  pendiente: string;
  vencido: string;
  comprobantes: number;
}

export interface Pendientes {
  /** Por vencimiento, lo más viejo primero. */
  comprobantes: ComprobantePendiente[];
  /** Quién debe (o a quién se le debe) más, primero. */
  porContraparte: PendientesPorContraparte[];
  totalPendiente: string;
  totalVencido: string;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Lo que queda por cobrar (ventas) o por pagar (compras) de toda la empresa,
 * comprobante por comprobante. Es la misma cuenta corriente que las fichas
 * (imputaciones y FIFO), pero de todas las contrapartes a la vez: responde
 * "¿qué tengo vencido?" o "¿qué cobro esta semana?" sin abrir cliente por
 * cliente.
 */
export async function comprobantesPendientes(
  actor: Actor,
  lado: Lado,
  filtros: { soloVencidos?: boolean; venceHasta?: string | undefined } = {},
  hoy: string = hoyEnArgentina(),
): Promise<Pendientes> {
  return withTenant(actor.tenantId, async (tx) => {
    const cc = await saldosCuentaCorriente(tx, lado);
    const abiertos = cc.comprobantes
      .filter((c) => c.pendiente.esPositivo())
      .filter((c) => !filtros.soloVencidos || c.vencimiento < hoy)
      .filter((c) => !filtros.venceHasta || c.vencimiento <= filtros.venceHasta)
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));

    const datos = await datosDeComprobantes(
      tx,
      lado,
      abiertos.map((c) => c.id),
    );
    const contraparteIds = [...new Set(abiertos.map((c) => c.contraparteId))];
    const tabla = lado === "ventas" ? clientes : proveedores;
    const nombres = new Map(
      (
        await tx
          .select({ id: tabla.id, nombre: sql<string>`${tabla.razonSocial}` })
          .from(tabla)
          .where(contraparteIds.length > 0 ? inArray(tabla.id, contraparteIds) : sql`false`)
      ).map((f) => [f.id, f.nombre]),
    );

    const grupos = new Map<string, { pendiente: Money; vencido: Money; comprobantes: number }>();
    for (const c of abiertos) {
      const g = grupos.get(c.contraparteId) ?? {
        pendiente: Money.cero(ARS),
        vencido: Money.cero(ARS),
        comprobantes: 0,
      };
      grupos.set(c.contraparteId, {
        pendiente: g.pendiente.sumar(c.pendiente),
        vencido: c.vencimiento < hoy ? g.vencido.sumar(c.pendiente) : g.vencido,
        comprobantes: g.comprobantes + 1,
      });
    }

    const porContraparte = [...grupos.entries()]
      .sort(([, a], [, b]) =>
        b.pendiente.mayorQue(a.pendiente) ? 1 : a.pendiente.mayorQue(b.pendiente) ? -1 : 0,
      )
      .map(([id, g]) => ({
        contraparteId: id,
        nombre: nombres.get(id) ?? "",
        pendiente: g.pendiente.aStringFiscal(),
        vencido: g.vencido.aStringFiscal(),
        comprobantes: g.comprobantes,
      }));

    return {
      comprobantes: abiertos.map((c) => ({
        id: c.id,
        contraparteId: c.contraparteId,
        contraparte: nombres.get(c.contraparteId) ?? "",
        comprobante: datos.get(c.id)?.descripcion ?? "",
        fecha: datos.get(c.id)?.fecha ?? "",
        vencimiento: c.vencimiento,
        total: c.total.aStringFiscal(),
        pendiente: c.pendiente.aStringFiscal(),
        estado: c.estado,
        diasDeAtraso: Math.max(0, diasEntre(c.vencimiento, hoy)),
      })),
      porContraparte,
      totalPendiente: Money.sumarTodos(
        abiertos.map((c) => c.pendiente),
        ARS,
      ).aStringFiscal(),
      totalVencido: Money.sumarTodos(
        abiertos.filter((c) => c.vencimiento < hoy).map((c) => c.pendiente),
        ARS,
      ).aStringFiscal(),
    };
  });
}
