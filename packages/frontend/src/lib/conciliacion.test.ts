import { describe, expect, it } from "vitest";
import {
  aEnviar,
  aTodasLasSinPar,
  decisionesIniciales,
  decisionInicial,
  pareceOtraCuenta,
  resumir,
} from "./conciliacion.js";
import type { Propuesta, PropuestaLinea } from "./extracto.js";

function linea(parcial: Partial<PropuestaLinea> & { indice: number }): PropuestaLinea {
  return {
    fecha: "2026-10-05",
    descripcion: "CREDITO TRANSFERENCIA",
    importe: "15000.00",
    saldo: "15000.00",
    resultado: "sin_par",
    movimientoId: null,
    candidatos: [],
    sugerencia: null,
    ...parcial,
  };
}

function propuesta(...lineas: PropuestaLinea[]): Propuesta {
  return {
    cuenta: [],
    saldo: { ok: true, inicial: "0.00", final: "0.00" },
    filasIlegibles: [],
    yaResueltas: 0,
    lineas,
    sinLinea: [],
    movimientos: {},
    archivo: { nombre: "e.xlsx", hash: "a".repeat(64) },
  };
}

describe("decisionInicial", () => {
  it("una línea que casa arranca conciliada con su movimiento", () => {
    expect(decisionInicial(linea({ indice: 0, resultado: "casa", movimientoId: "m1" }))).toEqual({
      accion: "conciliar",
      movimientoId: "m1",
    });
  });

  it("una línea sin par arranca para crear", () => {
    expect(decisionInicial(linea({ indice: 0, resultado: "sin_par" }))).toEqual({
      accion: "crear",
    });
  });

  it("una ambigua arranca sin decidir: no se elige por la persona", () => {
    // Con dos cobros iguales, elegir uno por ella le imputa el cobro al
    // cliente que puede no ser.
    expect(
      decisionInicial(linea({ indice: 0, resultado: "ambigua", candidatos: ["m1", "m2"] })),
    ).toEqual({ accion: "despues" });
  });
});

describe("aEnviar", () => {
  it("lo que quedó para después no viaja", () => {
    const p = propuesta(linea({ indice: 0, resultado: "ambigua", candidatos: ["m1", "m2"] }));
    expect(aEnviar(p, decisionesIniciales(p))).toEqual([]);
  });

  it("una línea creada lleva el cliente sugerido por el CUIT", () => {
    // El cobro nace atado a su cliente y se puede imputar sin buscarlo.
    const p = propuesta(
      linea({
        indice: 0,
        sugerencia: { contraparte: "cliente", id: "c1", nombre: "Cliente SRL" },
      }),
    );
    expect(aEnviar(p, decisionesIniciales(p))).toEqual([
      expect.objectContaining({ accion: "crear", clienteId: "c1" }),
    ]);
  });

  it("un débito creado lleva el proveedor sugerido, nunca un cliente", () => {
    const p = propuesta(
      linea({
        indice: 0,
        importe: "-3600.00",
        sugerencia: { contraparte: "proveedor", id: "p1", nombre: "Proveedor SA" },
      }),
    );
    const [d] = aEnviar(p, decisionesIniciales(p));
    expect(d).toMatchObject({ accion: "crear", proveedorId: "p1" });
    expect(d).not.toHaveProperty("clienteId");
  });

  it("manda la línea tal como vino, que es lo que el servidor vuelve a verificar", () => {
    const p = propuesta(linea({ indice: 0, resultado: "casa", movimientoId: "m1" }));
    expect(aEnviar(p, decisionesIniciales(p))[0]?.linea).toEqual({
      fecha: "2026-10-05",
      descripcion: "CREDITO TRANSFERENCIA",
      importe: "15000.00",
      saldo: "15000.00",
    });
  });

  it("respeta lo que la persona cambió", () => {
    const p = propuesta(linea({ indice: 0, resultado: "casa", movimientoId: "m1" }));
    const decisiones = decisionesIniciales(p);
    decisiones.set(0, { accion: "ignorar" });
    expect(aEnviar(p, decisiones)).toEqual([expect.objectContaining({ accion: "ignorar" })]);
  });
});

describe("resumir", () => {
  it("cuenta cuántas de cada una", () => {
    const p = propuesta(
      linea({ indice: 0, resultado: "casa", movimientoId: "m1" }),
      linea({ indice: 1, resultado: "sin_par" }),
      linea({ indice: 2, resultado: "ambigua", candidatos: ["a", "b"] }),
    );
    expect(resumir(decisionesIniciales(p))).toEqual({
      conciliar: 1,
      crear: 1,
      ignorar: 0,
      despues: 1,
    });
  });
});

describe("un extracto que no casa con nada", () => {
  const sinPar = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      linea({ indice: i, fecha: `2026-10-${String(i + 1).padStart(2, "0")}` }),
    );

  it("no arranca marcado para crear: puede ser de otra cuenta", () => {
    // Subir el extracto equivocado no puede estar a un clic de cargar
    // cientos de movimientos falsos.
    const p = propuesta(...sinPar(6));
    expect(pareceOtraCuenta(p)).toBe(true);
    expect(resumir(decisionesIniciales(p))).toMatchObject({ crear: 0, despues: 6 });
  });

  it("con una sola línea que case, ya no es sospechoso", () => {
    const p = propuesta(...sinPar(6), linea({ indice: 6, resultado: "casa", movimientoId: "m1" }));
    expect(pareceOtraCuenta(p)).toBe(false);
    expect(resumir(decisionesIniciales(p)).crear).toBe(6);
  });

  it("con pocas líneas tampoco: dos comisiones pueden no casar con nada", () => {
    const p = propuesta(...sinPar(2));
    expect(pareceOtraCuenta(p)).toBe(false);
    expect(resumir(decisionesIniciales(p)).crear).toBe(2);
  });

  it("crearlas todas es una acción explícita, y no toca las que casan", () => {
    const p = propuesta(...sinPar(6), linea({ indice: 6, resultado: "casa", movimientoId: "m1" }));
    const todas = aTodasLasSinPar(p, decisionesIniciales(p), "ignorar");
    expect(resumir(todas)).toMatchObject({ ignorar: 6, conciliar: 1 });
  });
});
