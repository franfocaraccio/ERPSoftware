import { createHash } from "node:crypto";
import { Money } from "@erp/core/money";
import { validarCuit } from "@erp/core/tax";
import { conciliar, type LineaExtracto } from "@erp/core/treasury";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { type Actor, auditar } from "../../db/auditar.js";
import { clientes } from "../../db/schema/clientes.js";
import { proveedores } from "../../db/schema/proveedores.js";
import { cuentas, lineasExtracto, movimientos } from "../../db/schema/tesoreria.js";
import { type TenantTx, withTenant } from "../../db/tenant-db.js";
import { exigirPropios } from "../_comunes/pertenencia.js";
import type { Extracto, FilaIlegible } from "./extracto.js";
import type { ConfirmarConciliacion } from "./schema.js";
import { crearMovimientoEn } from "./service.js";

/**
 * Conciliación bancaria: de un extracto leído a una propuesta, y de las
 * decisiones de una persona a movimientos conciliados.
 *
 * Son dos pasos separados a propósito. `proponerConciliacion` no escribe nada:
 * arma la pantalla. `confirmarConciliacion` aplica sólo lo que la persona
 * eligió, línea por línea. Nada entra solo.
 */

/** Días de diferencia que se aceptan entre el banco y lo cargado. */
export const TOLERANCIA_DIAS = 5;

/**
 * La identidad de una línea, para reconocerla en el próximo extracto.
 *
 * Fecha, importe, saldo y descripción. El saldo es el que la hace casi única:
 * dos líneas del mismo día y el mismo importe dejan saldos distintos.
 */
export function huellaDe(linea: {
  fecha: string;
  descripcion: string;
  importe: Money;
  saldo: Money;
}): string {
  return createHash("sha256")
    .update(
      [
        linea.fecha,
        linea.importe.aStringFiscal(),
        linea.saldo.aStringFiscal(),
        linea.descripcion,
      ].join("|"),
    )
    .digest("hex");
}

/**
 * El primer CUIT válido de la descripción, si hay uno.
 *
 * Galicia imprime el CUIT de la contraparte en las transferencias. Se exigen
 * once dígitos sueltos —un CBU tiene veintidós y no matchea— y el dígito
 * verificador, que descarta un número de operación que casualmente tenga once.
 */
export function cuitEnDescripcion(descripcion: string): string | null {
  for (const coincidencia of descripcion.matchAll(/(?<!\d)\d{11}(?!\d)/g)) {
    if (validarCuit(coincidencia[0])) {
      return coincidencia[0];
    }
  }
  return null;
}

/** "2026-10-09" corrido `dias`, en UTC para que el huso no mueva el día. */
function correrDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface PropuestaLinea {
  indice: number;
  fecha: string;
  descripcion: string;
  /** Con signo: negativo es un débito. */
  importe: string;
  saldo: string;
  resultado: "casa" | "ambigua" | "sin_par";
  movimientoId: string | null;
  candidatos: string[];
  /** Para una línea sin par: la contraparte que ya existe con su CUIT. */
  sugerencia: { contraparte: "cliente" | "proveedor"; id: string; nombre: string } | null;
}

export interface MovimientoResumen {
  id: string;
  fecha: string;
  tipo: "ingreso" | "egreso";
  importe: string;
  concepto: string | null;
}

export interface Propuesta {
  cuenta: string[];
  saldo:
    | { ok: true; inicial: string; final: string }
    | { ok: false; indice: number; esperado: string; leido: string };
  filasIlegibles: FilaIlegible[];
  /** Líneas de este extracto que ya se resolvieron con uno anterior. */
  yaResueltas: number;
  lineas: PropuestaLinea[];
  /** Cargados en el período que el banco no muestra. */
  sinLinea: string[];
  /** Los movimientos que la propuesta nombra, para mostrarlos. */
  movimientos: Record<string, MovimientoResumen>;
}

async function exigirCuenta(tx: TenantTx, cuentaId: string): Promise<void> {
  await exigirPropios(tx, cuentas, cuentas.id, [cuentaId], "Cuenta no encontrada");
}

export async function proponerConciliacion(
  actor: Actor,
  cuentaId: string,
  extracto: Extracto,
): Promise<Propuesta> {
  return withTenant(actor.tenantId, async (tx) => {
    await exigirCuenta(tx, cuentaId);

    const huellas = extracto.lineas.map(huellaDe);
    const resueltas = new Set(
      (
        await tx
          .select({ huella: lineasExtracto.huella })
          .from(lineasExtracto)
          .where(
            and(eq(lineasExtracto.cuentaId, cuentaId), inArray(lineasExtracto.huella, huellas)),
          )
      ).map((r) => r.huella),
    );

    // El saldo corrido se verifica sobre el extracto entero, pero se concilia
    // sólo lo que falta: lo ya resuelto en un extracto anterior no vuelve.
    const pendientes: LineaExtracto[] = extracto.lineas.filter(
      (_, i) => !resueltas.has(huellas[i] ?? ""),
    );

    const fechas = pendientes.map((l) => l.fecha).sort();
    const candidatos =
      fechas.length === 0
        ? []
        : await tx
            .select()
            .from(movimientos)
            .where(
              and(
                eq(movimientos.cuentaId, cuentaId),
                eq(movimientos.conciliado, false),
                gte(movimientos.fecha, correrDias(fechas[0] ?? "", -TOLERANCIA_DIAS)),
                lte(movimientos.fecha, correrDias(fechas.at(-1) ?? "", TOLERANCIA_DIAS)),
              ),
            );

    const resultado = conciliar(
      pendientes,
      candidatos.map((m) => ({
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        importe: Money.desdeString(m.importe, "ARS"),
      })),
      { toleranciaDias: TOLERANCIA_DIAS },
    );

    // Para las líneas sin par, la contraparte que ya existe con ese CUIT: en
    // un crédito se busca un cliente, en un débito un proveedor.
    const sinPar = pendientes.filter((l) =>
      resultado.lineas.some((r) => r.linea === l.indice && r.tipo === "sin_par"),
    );
    const cuits = [
      ...new Set(sinPar.map((l) => cuitEnDescripcion(l.descripcion)).filter((c) => c !== null)),
    ];
    const [conCliente, conProveedor] =
      cuits.length === 0
        ? [[], []]
        : await Promise.all([
            tx
              .select({ id: clientes.id, cuit: clientes.cuit, nombre: clientes.razonSocial })
              .from(clientes)
              .where(inArray(clientes.cuit, cuits)),
            tx
              .select({
                id: proveedores.id,
                cuit: proveedores.cuit,
                nombre: proveedores.razonSocial,
              })
              .from(proveedores)
              .where(inArray(proveedores.cuit, cuits)),
          ]);

    const porIndice = new Map(resultado.lineas.map((r) => [r.linea, r]));
    const lineas: PropuestaLinea[] = pendientes.map((l) => {
      const r = porIndice.get(l.indice);
      const cuit = r?.tipo === "sin_par" ? cuitEnDescripcion(l.descripcion) : null;
      const esCredito = !l.importe.esNegativo();
      const contraparte = cuit
        ? esCredito
          ? conCliente.find((c) => c.cuit === cuit)
          : conProveedor.find((p) => p.cuit === cuit)
        : undefined;
      return {
        indice: l.indice,
        fecha: l.fecha,
        descripcion: l.descripcion,
        importe: l.importe.aStringFiscal(),
        saldo: l.saldo.aStringFiscal(),
        resultado: r?.tipo ?? "sin_par",
        movimientoId: r?.tipo === "casa" ? r.movimientoId : null,
        candidatos: r?.tipo === "ambigua" ? r.candidatos : [],
        sugerencia: contraparte
          ? {
              contraparte: esCredito ? "cliente" : "proveedor",
              id: contraparte.id,
              nombre: contraparte.nombre,
            }
          : null,
      };
    });

    const movimientosResumen = Object.fromEntries(
      candidatos.map((m) => [
        m.id,
        { id: m.id, fecha: m.fecha, tipo: m.tipo, importe: m.importe, concepto: m.concepto },
      ]),
    );

    return {
      cuenta: extracto.cuenta,
      saldo: extracto.saldo.ok
        ? {
            ok: true,
            inicial: extracto.saldo.saldoInicial.aStringFiscal(),
            final: extracto.saldo.saldoFinal.aStringFiscal(),
          }
        : {
            ok: false,
            indice: extracto.saldo.indice,
            esperado: extracto.saldo.esperado.aStringFiscal(),
            leido: extracto.saldo.leido.aStringFiscal(),
          },
      filasIlegibles: extracto.filasIlegibles,
      yaResueltas: resueltas.size,
      lineas,
      sinLinea: resultado.sinLinea,
      movimientos: movimientosResumen,
    };
  });
}

export class ConciliacionInvalidaError extends Error {}

export interface ResultadoConfirmacion {
  conciliadas: number;
  creadas: number;
  ignoradas: number;
  /** Ya estaban resueltas: un reenvío o un extracto superpuesto. No se tocan. */
  repetidas: number;
}

/**
 * Aplica las decisiones de la persona, todas en una transacción.
 *
 * Los datos de cada línea vuelven del cliente, así que nada se da por bueno:
 * la huella se recalcula acá, y un movimiento a conciliar tiene que ser de esta
 * cuenta, no estar conciliado y tener el mismo sentido e importe que la línea.
 * Si una sola decisión no cierra, no se aplica ninguna: una conciliación a
 * medias es peor que ninguna, porque no se sabe qué quedó hecho.
 */
export async function confirmarConciliacion(
  actor: Actor,
  input: ConfirmarConciliacion,
): Promise<ResultadoConfirmacion> {
  return withTenant(actor.tenantId, async (tx) => {
    await exigirCuenta(tx, input.cuentaId);

    const resultado: ResultadoConfirmacion = {
      conciliadas: 0,
      creadas: 0,
      ignoradas: 0,
      repetidas: 0,
    };

    for (const decision of input.decisiones) {
      const linea = {
        fecha: decision.linea.fecha,
        descripcion: decision.linea.descripcion,
        importe: Money.desdeString(decision.linea.importe, "ARS"),
        saldo: Money.desdeString(decision.linea.saldo, "ARS"),
      };
      const huella = huellaDe(linea);

      const [yaEsta] = await tx
        .select({ id: lineasExtracto.id })
        .from(lineasExtracto)
        .where(and(eq(lineasExtracto.cuentaId, input.cuentaId), eq(lineasExtracto.huella, huella)));
      if (yaEsta) {
        resultado.repetidas++;
        continue;
      }

      const tipo = linea.importe.esNegativo() ? "egreso" : "ingreso";
      const importeAbsoluto = linea.importe.esNegativo() ? linea.importe.negar() : linea.importe;
      let movimientoId: string | null = null;

      if (decision.accion === "conciliar") {
        const [m] = await tx
          .select()
          .from(movimientos)
          .where(eq(movimientos.id, decision.movimientoId));
        if (!m || m.cuentaId !== input.cuentaId) {
          throw new ConciliacionInvalidaError("El movimiento no es de esta cuenta.");
        }
        if (m.conciliado) {
          throw new ConciliacionInvalidaError(
            "Ese movimiento ya estaba conciliado con otra línea.",
          );
        }
        if (m.tipo !== tipo || !Money.desdeString(m.importe, "ARS").igualA(importeAbsoluto)) {
          throw new ConciliacionInvalidaError(
            "El movimiento no tiene el mismo sentido e importe que la línea del banco.",
          );
        }
        await tx.update(movimientos).set({ conciliado: true }).where(eq(movimientos.id, m.id));
        await auditar(tx, actor, {
          tabla: "movimientos",
          registroId: m.id,
          accion: "modificacion",
          detalle: {
            antes: { conciliado: false },
            despues: { conciliado: true },
            origen: "extracto",
          },
        });
        movimientoId = m.id;
        resultado.conciliadas++;
      } else if (decision.accion === "crear") {
        const creado = await crearMovimientoEn(tx, actor, {
          fecha: linea.fecha,
          cuentaId: input.cuentaId,
          tipo,
          medioPago: decision.medioPago,
          concepto: (decision.concepto ?? linea.descripcion).slice(0, 300),
          importe: importeAbsoluto.aStringFiscal(),
          clienteId: decision.clienteId ?? null,
          proveedorId: decision.proveedorId ?? null,
          chequeId: null,
          categoriaId: decision.categoriaId ?? null,
          // Viene del banco: ya está conciliado por definición.
          conciliado: true,
          imputaciones: [],
        });
        movimientoId = creado.id;
        resultado.creadas++;
      } else {
        resultado.ignoradas++;
      }

      const [registrada] = await tx
        .insert(lineasExtracto)
        .values({
          tenantId: actor.tenantId,
          cuentaId: input.cuentaId,
          fecha: linea.fecha,
          descripcion: linea.descripcion,
          importe: linea.importe.aStringFiscal(),
          saldo: linea.saldo.aStringFiscal(),
          huella,
          resolucion:
            decision.accion === "conciliar"
              ? "conciliada"
              : decision.accion === "crear"
                ? "creada"
                : "ignorada",
          movimientoId,
          archivoHash: input.archivoHash,
          usuarioId: actor.usuarioId,
        })
        .returning();
      if (!registrada) {
        throw new Error("No se pudo registrar la línea del extracto");
      }

      // Ignorar también se audita: es una decisión que deja plata afuera de
      // los libros, y es la primera que hay que poder revisar.
      await auditar(tx, actor, {
        tabla: "lineas_extracto",
        registroId: registrada.id,
        accion: "alta",
        detalle: { despues: registrada },
      });
    }

    return resultado;
  });
}
