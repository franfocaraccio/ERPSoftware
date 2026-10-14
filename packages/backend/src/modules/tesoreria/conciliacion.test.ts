import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { lineasExtracto, movimientos } from "../../db/schema/tesoreria.js";
import { withTenant } from "../../db/tenant-db.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import { crearCliente } from "../clientes/service.js";
import {
  ConciliacionInvalidaError,
  confirmarConciliacion,
  cuitEnDescripcion,
  proponerConciliacion,
} from "./conciliacion.js";
import { interpretarExtracto } from "./extracto.js";
import { crearCuenta, crearMovimiento } from "./service.js";
import type { Celda } from "./xlsx.js";

type Actor = { tenantId: string; usuarioId: string };

const HASH = "a".repeat(64);
const COLUMNAS: Celda[] = ["Fecha", "Movimiento", "Débito", "Crédito", "Saldo Parcial"];

/** Un extracto como el de Galicia, del más nuevo al más viejo. Saldo inicial 0. */
function extracto(...movimientosDelBanco: Celda[][]) {
  return interpretarExtracto([COLUMNAS, ...movimientosDelBanco]);
}

const COBRO = [
  "05/10/2026",
  " CREDITO TRANSFERENCIA\n Cliente SRL\n 30692138747\n",
  "0,00",
  "15.000,00",
  "15000",
];
const PAGO = [
  "09/10/2026",
  " TRANSFERENCIA A TERCEROS\n Proveedor SA\n",
  "-3.600,00",
  "0,00",
  "11400",
];
const COMISION = ["13/10/2026", " COMISION MANTENIMIENTO\n", "-400,00", "0,00", "11000"];

async function escenario() {
  const actor = await crearTenantDePrueba();
  const cuenta = await crearCuenta(actor, {
    nombre: "Galicia CC",
    tipo: "cuenta_corriente",
    moneda: "ARS",
  });
  return { actor, cuentaId: cuenta.id };
}

async function movimiento(
  actor: Actor,
  cuentaId: string,
  fecha: string,
  tipo: "ingreso" | "egreso",
  importe: string,
) {
  return crearMovimiento(actor, {
    fecha,
    cuentaId,
    tipo,
    medioPago: "transferencia",
    importe,
    conciliado: false,
    imputaciones: [],
  });
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("cuitEnDescripcion", () => {
  it("encuentra el CUIT de la contraparte en una transferencia de Galicia", () => {
    expect(cuitEnDescripcion("CREDITO TRANSFERENCIA · Cliente SRL · 30692138747")).toBe(
      "30692138747",
    );
  });

  it("no confunde un CBU con un CUIT", () => {
    // Veintidós dígitos: adentro hay muchas tiras de once que no son un CUIT.
    expect(cuitEnDescripcion("TRANSFERENCIA · 0170042840000002399928")).toBeNull();
  });

  it("descarta once dígitos que no verifican", () => {
    // Un número de operación puede tener once dígitos por casualidad.
    expect(cuitEnDescripcion("OPERACION 30692138748")).toBeNull();
  });
});

describe("proponerConciliacion", () => {
  it("casa la línea con el movimiento ya cargado", async () => {
    const { actor, cuentaId } = await escenario();
    const m = await movimiento(actor, cuentaId, "2026-10-04", "ingreso", "15000.00");

    const p = await proponerConciliacion(actor, cuentaId, extracto(COBRO));
    expect(p.lineas).toHaveLength(1);
    expect(p.lineas[0]).toMatchObject({ resultado: "casa", movimientoId: m.id });
  });

  it("para una línea sin par, sugiere el cliente que tiene ese CUIT", async () => {
    // Es lo que ahorra tipear: el banco ya dice de quién vino la plata.
    const { actor, cuentaId } = await escenario();
    const cliente = await crearCliente(actor, {
      razonSocial: "Cliente SRL",
      cuit: "30692138747",
      condicionIva: "responsable_inscripto",
    });

    const p = await proponerConciliacion(actor, cuentaId, extracto(COBRO));
    expect(p.lineas[0]).toMatchObject({
      resultado: "sin_par",
      sugerencia: { contraparte: "cliente", id: cliente.id },
    });
  });

  it("no ofrece un movimiento que ya está conciliado", async () => {
    const { actor, cuentaId } = await escenario();
    const m = await movimiento(actor, cuentaId, "2026-10-05", "ingreso", "15000.00");
    await withTenant(actor.tenantId, (tx) =>
      tx.update(movimientos).set({ conciliado: true }).where(eq(movimientos.id, m.id)),
    );

    const p = await proponerConciliacion(actor, cuentaId, extracto(COBRO));
    expect(p.lineas[0]?.resultado).toBe("sin_par");
  });

  it("verifica el saldo corrido del extracto entero", async () => {
    const { actor, cuentaId } = await escenario();
    const p = await proponerConciliacion(actor, cuentaId, extracto(COMISION, PAGO, COBRO));
    expect(p.saldo).toEqual({ ok: true, inicial: "0.00", final: "11000.00" });
  });

  it("no acepta la cuenta de otra empresa", async () => {
    const { cuentaId } = await escenario();
    const otra = await crearTenantDePrueba();
    await expect(proponerConciliacion(otra, cuentaId, extracto(COBRO))).rejects.toThrow(
      "Cuenta no encontrada",
    );
  });
});

describe("confirmarConciliacion", () => {
  const linea = (fecha: string, descripcion: string, importe: string, saldo: string) => ({
    fecha,
    descripcion,
    importe,
    saldo,
  });
  const LINEA_COBRO = linea(
    "2026-10-05",
    "CREDITO TRANSFERENCIA · Cliente SRL · 30692138747",
    "15000.00",
    "15000.00",
  );

  it("conciliar marca el movimiento y registra la línea", async () => {
    const { actor, cuentaId } = await escenario();
    const m = await movimiento(actor, cuentaId, "2026-10-05", "ingreso", "15000.00");

    const r = await confirmarConciliacion(actor, {
      cuentaId,
      archivoHash: HASH,
      decisiones: [{ linea: LINEA_COBRO, accion: "conciliar", movimientoId: m.id }],
    });

    expect(r).toMatchObject({ conciliadas: 1, creadas: 0, ignoradas: 0 });
    const [actualizado] = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(movimientos).where(eq(movimientos.id, m.id)),
    );
    expect(actualizado?.conciliado).toBe(true);
  });

  it("crear da de alta el movimiento ya conciliado", async () => {
    const { actor, cuentaId } = await escenario();
    const r = await confirmarConciliacion(actor, {
      cuentaId,
      archivoHash: HASH,
      decisiones: [
        {
          linea: linea("2026-10-13", "COMISION MANTENIMIENTO", "-400.00", "11000.00"),
          accion: "crear",
          medioPago: "transferencia",
        },
      ],
    });

    expect(r.creadas).toBe(1);
    const creados = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(movimientos).where(eq(movimientos.cuentaId, cuentaId)),
    );
    // Un débito del banco es un egreso, por el importe sin signo.
    expect(creados).toEqual([
      expect.objectContaining({ tipo: "egreso", importe: "400.00", conciliado: true }),
    ]);
  });

  it("ignorar registra la línea sin crear nada", async () => {
    const { actor, cuentaId } = await escenario();
    const r = await confirmarConciliacion(actor, {
      cuentaId,
      archivoHash: HASH,
      decisiones: [{ linea: LINEA_COBRO, accion: "ignorar" }],
    });

    expect(r.ignoradas).toBe(1);
    const creados = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(movimientos).where(eq(movimientos.cuentaId, cuentaId)),
    );
    expect(creados).toEqual([]);
  });

  it("confirmar dos veces lo mismo no duplica nada", async () => {
    // El test que no puede faltar. Un doble clic, o un reintento después de un
    // corte, no puede crear el movimiento dos veces.
    const { actor, cuentaId } = await escenario();
    const pedido = {
      cuentaId,
      archivoHash: HASH,
      decisiones: [
        {
          linea: linea("2026-10-13", "COMISION MANTENIMIENTO", "-400.00", "11000.00"),
          accion: "crear" as const,
          medioPago: "transferencia" as const,
        },
      ],
    };

    await confirmarConciliacion(actor, pedido);
    const segunda = await confirmarConciliacion(actor, pedido);

    expect(segunda).toMatchObject({ creadas: 0, repetidas: 1 });
    const creados = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(movimientos).where(eq(movimientos.cuentaId, cuentaId)),
    );
    expect(creados).toHaveLength(1);
  });

  it("un extracto superpuesto no vuelve a proponer lo ya resuelto", async () => {
    // Lo normal: se baja "los últimos seis meses" cada mes. El segundo
    // archivo trae las líneas del primero más las nuevas.
    const { actor, cuentaId } = await escenario();
    const primero = await proponerConciliacion(actor, cuentaId, extracto(PAGO, COBRO));
    await confirmarConciliacion(actor, {
      cuentaId,
      archivoHash: HASH,
      decisiones: primero.lineas.map((l) => ({
        linea: { fecha: l.fecha, descripcion: l.descripcion, importe: l.importe, saldo: l.saldo },
        accion: "ignorar" as const,
      })),
    });

    const segundo = await proponerConciliacion(actor, cuentaId, extracto(COMISION, PAGO, COBRO));
    expect(segundo.yaResueltas).toBe(2);
    expect(segundo.lineas.map((l) => l.fecha)).toEqual(["2026-10-13"]);
  });

  it("si una decisión no cierra, no se aplica ninguna", async () => {
    // Una conciliación a medias es peor que ninguna: no se sabe qué quedó
    // hecho. La primera decisión es buena; la segunda, no.
    const { actor, cuentaId } = await escenario();
    const bueno = await movimiento(actor, cuentaId, "2026-10-05", "ingreso", "15000.00");
    const otraCuenta = await crearCuenta(actor, {
      nombre: "Otra",
      tipo: "caja_ahorro",
      moneda: "ARS",
    });
    const ajeno = await movimiento(actor, otraCuenta.id, "2026-10-13", "egreso", "400.00");

    await expect(
      confirmarConciliacion(actor, {
        cuentaId,
        archivoHash: HASH,
        decisiones: [
          { linea: LINEA_COBRO, accion: "conciliar", movimientoId: bueno.id },
          {
            linea: linea("2026-10-13", "COMISION", "-400.00", "11000.00"),
            accion: "conciliar",
            movimientoId: ajeno.id,
          },
        ],
      }),
    ).rejects.toThrow(ConciliacionInvalidaError);

    const [noTocado] = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(movimientos).where(eq(movimientos.id, bueno.id)),
    );
    expect(noTocado?.conciliado).toBe(false);
    const registradas = await withTenant(actor.tenantId, (tx) =>
      tx.select().from(lineasExtracto).where(eq(lineasExtracto.cuentaId, cuentaId)),
    );
    expect(registradas).toEqual([]);
  });

  it("no concilia con un movimiento de otro importe", async () => {
    // El cliente manda el id: no se da por bueno que coincida.
    const { actor, cuentaId } = await escenario();
    const m = await movimiento(actor, cuentaId, "2026-10-05", "ingreso", "14999.99");
    await expect(
      confirmarConciliacion(actor, {
        cuentaId,
        archivoHash: HASH,
        decisiones: [{ linea: LINEA_COBRO, accion: "conciliar", movimientoId: m.id }],
      }),
    ).rejects.toThrow(ConciliacionInvalidaError);
  });

  it("no deja ignorar una línea en la cuenta de otra empresa", async () => {
    // Ignorar es la única acción que no toca ningún movimiento, así que no
    // pasa por ninguna otra validación de la cuenta. Y la clave foránea no
    // alcanza: Postgres la verifica sin RLS, así que aceptaría el id de la
    // cuenta ajena y colgaría la línea de ella.
    const { cuentaId } = await escenario();
    const otra = await crearTenantDePrueba();
    await expect(
      confirmarConciliacion(otra, {
        cuentaId,
        archivoHash: HASH,
        decisiones: [{ linea: LINEA_COBRO, accion: "ignorar" }],
      }),
    ).rejects.toThrow("Cuenta no encontrada");
  });

  it("no concilia un movimiento que ya estaba conciliado", async () => {
    const { actor, cuentaId } = await escenario();
    const m = await movimiento(actor, cuentaId, "2026-10-05", "ingreso", "15000.00");
    await withTenant(actor.tenantId, (tx) =>
      tx.update(movimientos).set({ conciliado: true }).where(eq(movimientos.id, m.id)),
    );
    await expect(
      confirmarConciliacion(actor, {
        cuentaId,
        archivoHash: HASH,
        decisiones: [{ linea: LINEA_COBRO, accion: "conciliar", movimientoId: m.id }],
      }),
    ).rejects.toThrow("ya estaba conciliado");
  });
});
