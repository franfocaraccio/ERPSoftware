import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import {
  conciliar,
  type LineaExtracto,
  type MovimientoCandidato,
  verificarSaldoCorrido,
} from "./conciliacion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

/** Una línea del extracto. El importe va con signo: negativo es un débito. */
function linea(indice: number, fecha: string, importe: string, saldo: string): LineaExtracto {
  return {
    indice,
    fecha,
    descripcion: `línea ${indice}`,
    importe: ars(importe),
    saldo: ars(saldo),
  };
}

function movimiento(
  id: string,
  fecha: string,
  tipo: "ingreso" | "egreso",
  importe: string,
): MovimientoCandidato {
  return { id, fecha, tipo, importe: ars(importe) };
}

describe("verificarSaldoCorrido", () => {
  it("una cadena que cierra devuelve el saldo de apertura y el de cierre", () => {
    // Cada saldo es el anterior más el importe de la línea. El de apertura no
    // viene impreso: es lo que había antes de la primera línea.
    const r = verificarSaldoCorrido([
      linea(0, "2026-10-01", "1000.00", "11000.00"),
      linea(1, "2026-10-02", "-300.00", "10700.00"),
      linea(2, "2026-10-03", "50.50", "10750.50"),
    ]);
    expect(r.ok).toBe(true);
    expect(r.ok && r.saldoInicial.aStringFiscal()).toBe("10000.00");
    expect(r.ok && r.saldoFinal.aStringFiscal()).toBe("10750.50");
  });

  it("dice en qué línea se corta la cadena", () => {
    // Es lo que hace útil al saldo corrido: un importe mal leído o una línea
    // que falta no se detectan "en algún lado", se detectan ahí.
    const r = verificarSaldoCorrido([
      linea(0, "2026-10-01", "1000.00", "11000.00"),
      linea(1, "2026-10-02", "-300.00", "10700.00"),
      linea(2, "2026-10-03", "50.50", "10800.00"),
    ]);
    expect(r).toMatchObject({ ok: false, indice: 2 });
    expect(!r.ok && r.esperado.aStringFiscal()).toBe("10750.50");
    expect(!r.ok && r.leido.aStringFiscal()).toBe("10800.00");
  });

  it("un extracto sin líneas no tiene nada que verificar", () => {
    expect(() => verificarSaldoCorrido([])).toThrow();
  });
});

describe("conciliar", () => {
  const OPCIONES = { toleranciaDias: 5 };

  it("casa una línea con el movimiento del mismo importe y sentido", () => {
    const r = conciliar(
      [linea(0, "2026-10-05", "15000.00", "15000.00")],
      [movimiento("m1", "2026-10-05", "ingreso", "15000.00")],
      OPCIONES,
    );
    expect(r.lineas).toEqual([{ tipo: "casa", linea: 0, movimientoId: "m1" }]);
    expect(r.sinLinea).toEqual([]);
  });

  it("un crédito no casa con un egreso del mismo importe", () => {
    // El sentido es parte del dato: entrar y salir 15.000 no es lo mismo.
    const r = conciliar(
      [linea(0, "2026-10-05", "15000.00", "15000.00")],
      [movimiento("m1", "2026-10-05", "egreso", "15000.00")],
      OPCIONES,
    );
    expect(r.lineas).toEqual([{ tipo: "sin_par", linea: 0 }]);
  });

  it("tolera que el banco acredite unos días después", () => {
    // Una transferencia cargada el viernes se acredita el lunes.
    const r = conciliar(
      [linea(0, "2026-10-09", "-8000.00", "-8000.00")],
      [movimiento("m1", "2026-10-06", "egreso", "8000.00")],
      OPCIONES,
    );
    expect(r.lineas[0]).toEqual({ tipo: "casa", linea: 0, movimientoId: "m1" });
  });

  it("el borde de la tolerancia cuenta: cinco días exactos casa, seis no", () => {
    const casa = conciliar(
      [linea(0, "2026-10-11", "-8000.00", "-8000.00")],
      [movimiento("m1", "2026-10-06", "egreso", "8000.00")],
      OPCIONES,
    );
    expect(casa.lineas[0]?.tipo).toBe("casa");

    const noCasa = conciliar(
      [linea(0, "2026-10-12", "-8000.00", "-8000.00")],
      [movimiento("m1", "2026-10-06", "egreso", "8000.00")],
      OPCIONES,
    );
    expect(noCasa.lineas[0]?.tipo).toBe("sin_par");
  });

  it("fuera de la tolerancia no casa", () => {
    const r = conciliar(
      [linea(0, "2026-10-20", "-8000.00", "-8000.00")],
      [movimiento("m1", "2026-10-06", "egreso", "8000.00")],
      OPCIONES,
    );
    expect(r.lineas[0]).toEqual({ tipo: "sin_par", linea: 0 });
  });

  it("el importe tiene que ser exacto", () => {
    // Las comisiones y los impuestos bancarios vienen en líneas aparte: un
    // depósito no llega descontado. Si un día aparece un banco que sí los
    // descuenta, este test es el que tiene que cambiar.
    const r = conciliar(
      [linea(0, "2026-10-05", "14999.99", "14999.99")],
      [movimiento("m1", "2026-10-05", "ingreso", "15000.00")],
      OPCIONES,
    );
    expect(r.lineas[0]).toEqual({ tipo: "sin_par", linea: 0 });
  });

  it("con dos candidatos no elige: lo deja para una persona", () => {
    // Dos cobros de 5.000 en la misma semana son lo más normal del mundo, y
    // casar el equivocado imputa el cobro al cliente que no es.
    const r = conciliar(
      [linea(0, "2026-10-05", "5000.00", "5000.00")],
      [
        movimiento("m1", "2026-10-04", "ingreso", "5000.00"),
        movimiento("m2", "2026-10-06", "ingreso", "5000.00"),
      ],
      OPCIONES,
    );
    expect(r.lineas[0]).toEqual({ tipo: "ambigua", linea: 0, candidatos: ["m1", "m2"] });
  });

  it("un movimiento no casa con dos líneas", () => {
    // Si casara con las dos, conciliar el extracto daría por cobrado dos veces
    // lo que se cobró una.
    const r = conciliar(
      [linea(0, "2026-10-05", "5000.00", "5000.00"), linea(1, "2026-10-06", "5000.00", "10000.00")],
      [movimiento("m1", "2026-10-05", "ingreso", "5000.00")],
      OPCIONES,
    );
    const casadas = r.lineas.filter((l) => l.tipo === "casa");
    expect(casadas).toHaveLength(1);
    expect(r.lineas.filter((l) => l.tipo === "sin_par")).toHaveLength(1);
  });

  it("marca lo cargado en el período que el banco no muestra", () => {
    // Es un tipeo o algo que todavía no se acreditó: en los dos casos, alguien
    // tiene que mirarlo.
    const r = conciliar(
      [linea(0, "2026-10-01", "1000.00", "1000.00"), linea(1, "2026-10-10", "-200.00", "800.00")],
      [
        movimiento("m1", "2026-10-01", "ingreso", "1000.00"),
        movimiento("fantasma", "2026-10-05", "egreso", "750.00"),
      ],
      OPCIONES,
    );
    expect(r.sinLinea).toEqual(["fantasma"]);
  });

  it("lo cargado fuera del período no es asunto de este extracto", () => {
    const r = conciliar(
      [linea(0, "2026-10-01", "1000.00", "1000.00")],
      [movimiento("viejo", "2026-08-15", "egreso", "750.00")],
      OPCIONES,
    );
    expect(r.sinLinea).toEqual([]);
  });
});
