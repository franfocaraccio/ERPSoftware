import { antiguedadDeuda, enMora } from "@erp/core/balances";
import { hoyEnArgentina } from "@erp/core/dates";
import { participacion } from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Actor } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { comprobantesCompra } from "../../db/schema/compras.js";
import { comprobantesVenta } from "../../db/schema/facturacion.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { cheques, cuentas, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { leerParametros } from "../parametros/service.js";
import { type Lado, type SaldosCuentaCorriente, saldosCuentaCorriente } from "./saldos.js";

const ARS = "ARS" as const;

export interface ComprobanteDeFicha {
  id: string;
  descripcion: string;
  fecha: string;
  vencimiento: string;
  total: string;
  pendiente: string;
  estado: "pendiente" | "parcial" | "cobrada" | "vencida";
}

export interface MovimientoDeFicha {
  id: string;
  fecha: string;
  tipo: "ingreso" | "egreso";
  concepto: string | null;
  importe: string;
  cuenta: string;
  moneda: "ARS" | "USD";
}

export interface CuentaCorrienteDeFicha {
  /** Lo que debe (o se le debe), en pesos: pendiente menos lo que quedó a cuenta. */
  saldo: string;
  aCuenta: string;
  antiguedad: {
    aVencer: string;
    hasta30: string;
    de31a60: string;
    de61a90: string;
    masDe90: string;
  };
  abiertos: ComprobanteDeFicha[];
  movimientos: MovimientoDeFicha[];
}

export interface FichaCliente extends CuentaCorrienteDeFicha {
  cliente: typeof clientes.$inferSelect;
  enMora: boolean;
  umbralMoraDias: number;
  /** Porcentaje del límite de crédito usado; null sin límite. */
  creditoUsado: string | null;
  excedeLimite: boolean;
  cheques: {
    id: string;
    numero: string;
    banco: string | null;
    fechaPago: string;
    importe: string;
    estado: string;
  }[];
}

export interface FichaProveedor extends CuentaCorrienteDeFicha {
  proveedor: typeof proveedores.$inferSelect;
}

async function cuentaCorrienteDe(
  tx: TenantTx,
  lado: Lado,
  contraparteId: string,
): Promise<{ cc: SaldosCuentaCorriente; ficha: CuentaCorrienteDeFicha }> {
  const hoy = hoyEnArgentina();
  const cc = await saldosCuentaCorriente(tx, lado, { contraparteIds: [contraparteId] });
  const abiertosCC = cc.comprobantes
    .filter((c) => c.pendiente.esPositivo())
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const ids = abiertosCC.map((c) => c.id);

  const datos = new Map(
    (lado === "ventas"
      ? await tx
          .select({
            id: comprobantesVenta.id,
            descripcion: sql<string>`case ${comprobantesVenta.clase} when 'nota_debito' then 'ND ' else 'FC ' end || ${comprobantesVenta.letra} || ' ' || lpad(${comprobantesVenta.puntoVenta}::text, 4, '0') || '-' || coalesce(lpad(${comprobantesVenta.numero}::text, 8, '0'), 's/n')`,
            fecha: comprobantesVenta.fechaEmision,
          })
          .from(comprobantesVenta)
          .where(ids.length > 0 ? inArray(comprobantesVenta.id, ids) : sql`false`)
      : await tx
          .select({
            id: comprobantesCompra.id,
            descripcion: sql<string>`coalesce(${comprobantesCompra.numeroCompleto}, ${comprobantesCompra.concepto}, 'Compra')`,
            fecha: comprobantesCompra.fechaRecepcion,
          })
          .from(comprobantesCompra)
          .where(ids.length > 0 ? inArray(comprobantesCompra.id, ids) : sql`false`)
    ).map((d) => [d.id, d]),
  );

  const pendiente = Money.sumarTodos(
    abiertosCC.map((c) => c.pendiente),
    ARS,
  );
  const aCuenta = cc.aCuenta.get(contraparteId) ?? Money.cero(ARS);
  const antiguedad = antiguedadDeuda(abiertosCC, hoy);

  const columna = lado === "ventas" ? movimientos.clienteId : movimientos.proveedorId;
  const ultimos = await tx
    .select({
      id: movimientos.id,
      fecha: movimientos.fecha,
      tipo: movimientos.tipo,
      concepto: movimientos.concepto,
      importe: movimientos.importe,
      cuenta: cuentas.nombre,
      moneda: cuentas.moneda,
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(eq(columna, contraparteId))
    .orderBy(desc(movimientos.fecha), desc(movimientos.createdAt))
    .limit(10);

  return {
    cc,
    ficha: {
      saldo: pendiente.restar(aCuenta).aStringFiscal(),
      aCuenta: aCuenta.aStringFiscal(),
      antiguedad: {
        aVencer: antiguedad.aVencer.aStringFiscal(),
        hasta30: antiguedad.hasta30.aStringFiscal(),
        de31a60: antiguedad.de31a60.aStringFiscal(),
        de61a90: antiguedad.de61a90.aStringFiscal(),
        masDe90: antiguedad.masDe90.aStringFiscal(),
      },
      abiertos: abiertosCC.map((c) => ({
        id: c.id,
        descripcion: datos.get(c.id)?.descripcion ?? "",
        fecha: datos.get(c.id)?.fecha ?? "",
        vencimiento: c.vencimiento,
        total: c.total.aStringFiscal(),
        pendiente: c.pendiente.aStringFiscal(),
        estado: c.estado,
      })),
      movimientos: ultimos,
    },
  };
}

/** Todo lo de un cliente en una pantalla: deuda, antigüedad, mora y crédito. */
export async function fichaCliente(actor: Actor, id: string): Promise<FichaCliente | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [cliente] = await tx.select().from(clientes).where(eq(clientes.id, id));
    if (!cliente) {
      return null;
    }
    const { umbralMoraDias } = await leerParametros(tx, actor.tenantId);
    const { cc, ficha } = await cuentaCorrienteDe(tx, "ventas", id);
    const saldo = Money.desdeString(ficha.saldo, ARS);
    const limite = cliente.limiteCredito ? Money.desdeString(cliente.limiteCredito, ARS) : null;

    const chequesCliente = await tx
      .select({
        id: cheques.id,
        numero: cheques.numero,
        banco: cheques.banco,
        fechaPago: cheques.fechaPago,
        importe: cheques.importe,
        estado: cheques.estado,
      })
      .from(cheques)
      .where(
        and(
          eq(cheques.libradorClienteId, id),
          or(eq(cheques.estado, "en_cartera"), eq(cheques.estado, "depositado")),
        ),
      )
      .orderBy(cheques.fechaPago);

    return {
      ...ficha,
      cliente,
      enMora: enMora(cc.comprobantes, hoyEnArgentina(), umbralMoraDias),
      umbralMoraDias,
      creditoUsado: limite && saldo.esPositivo() ? participacion(saldo, limite) : null,
      excedeLimite: limite !== null && saldo.mayorQue(limite),
      cheques: chequesCliente,
    };
  });
}

export async function fichaProveedor(actor: Actor, id: string): Promise<FichaProveedor | null> {
  return withTenant(actor.tenantId, async (tx) => {
    const [proveedor] = await tx.select().from(proveedores).where(eq(proveedores.id, id));
    if (!proveedor) {
      return null;
    }
    const { ficha } = await cuentaCorrienteDe(tx, "compras", id);
    return { ...ficha, proveedor };
  });
}
