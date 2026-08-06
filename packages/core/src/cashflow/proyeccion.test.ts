import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { HORIZONTE_SEMANAS, proyectarCaja, semanasDelHorizonte } from "./proyeccion.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("semanasDelHorizonte", () => {
  it("devuelve 13 semanas", () => {
    expect(semanasDelHorizonte("2026-08-05")).toHaveLength(HORIZONTE_SEMANAS);
  });

  it("la primera semana arranca el lunes de la semana en curso", () => {
    // 2026-08-05 es miércoles; su lunes es el 3.
    const [primera] = semanasDelHorizonte("2026-08-05");
    expect(primera?.inicio).toBe("2026-08-03");
    expect(primera?.fin).toBe("2026-08-09");
  });

  it("si hoy es lunes, la semana arranca ese mismo día", () => {
    const [primera] = semanasDelHorizonte("2026-08-03");
    expect(primera?.inicio).toBe("2026-08-03");
  });

  it("si hoy es domingo, sigue siendo la semana que arrancó el lunes", () => {
    const [primera] = semanasDelHorizonte("2026-08-09");
    expect(primera?.inicio).toBe("2026-08-03");
    expect(primera?.fin).toBe("2026-08-09");
  });

  it("las semanas son consecutivas y numeradas desde 1", () => {
    const semanas = semanasDelHorizonte("2026-08-05");
    expect(semanas[0]?.semana).toBe(1);
    expect(semanas[1]?.inicio).toBe("2026-08-10");
    expect(semanas[12]?.semana).toBe(13);
    expect(semanas[12]?.fin).toBe("2026-11-01");
  });
});

describe("proyectarCaja", () => {
  const hoy = "2026-08-05";

  it("sin movimientos, el saldo se arrastra sin cambios", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("100000"),
      cobros: [],
      pagos: [],
      minimoOperativo: null,
    });
    expect(filas).toHaveLength(13);
    expect(filas[0]?.saldoInicial.aStringFiscal()).toBe("100000.00");
    expect(filas[0]?.saldoFinal.aStringFiscal()).toBe("100000.00");
    expect(filas[12]?.saldoFinal.aStringFiscal()).toBe("100000.00");
  });

  it("asigna cada cobro y pago a su semana", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("100000"),
      cobros: [{ fecha: "2026-08-06", importe: ars("50000") }],
      pagos: [{ fecha: "2026-08-12", importe: ars("30000") }],
      minimoOperativo: null,
    });
    expect(filas[0]?.cobros.aStringFiscal()).toBe("50000.00");
    expect(filas[0]?.saldoFinal.aStringFiscal()).toBe("150000.00");
    expect(filas[1]?.pagos.aStringFiscal()).toBe("30000.00");
    expect(filas[1]?.saldoFinal.aStringFiscal()).toBe("120000.00");
  });

  it("encadena el saldo: el final de una semana es el inicial de la siguiente", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("10000"),
      cobros: [{ fecha: "2026-08-04", importe: ars("5000") }],
      pagos: [],
      minimoOperativo: null,
    });
    expect(filas[0]?.saldoFinal.aStringFiscal()).toBe("15000.00");
    expect(filas[1]?.saldoInicial.aStringFiscal()).toBe("15000.00");
  });

  it("acumula varios movimientos en la misma semana", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("0"),
      cobros: [
        { fecha: "2026-08-03", importe: ars("1000") },
        { fecha: "2026-08-09", importe: ars("2000") },
      ],
      pagos: [{ fecha: "2026-08-05", importe: ars("500") }],
      minimoOperativo: null,
    });
    expect(filas[0]?.cobros.aStringFiscal()).toBe("3000.00");
    expect(filas[0]?.pagos.aStringFiscal()).toBe("500.00");
    expect(filas[0]?.saldoFinal.aStringFiscal()).toBe("2500.00");
  });

  it("ignora lo que cae fuera del horizonte", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("1000"),
      // Anterior al horizonte y posterior a las 13 semanas.
      cobros: [
        { fecha: "2026-07-01", importe: ars("999999") },
        { fecha: "2027-01-01", importe: ars("999999") },
      ],
      pagos: [],
      minimoOperativo: null,
    });
    expect(filas[12]?.saldoFinal.aStringFiscal()).toBe("1000.00");
  });

  it("marca alerta cuando el saldo final cae por debajo del mínimo operativo", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("100000"),
      cobros: [],
      pagos: [{ fecha: "2026-08-12", importe: ars("80000") }],
      minimoOperativo: ars("50000"),
    });
    expect(filas[0]?.semaforo).toBe("ok");
    // 100000 − 80000 = 20000, por debajo de 50000.
    expect(filas[1]?.semaforo).toBe("alerta");
    // La alerta se arrastra: las semanas siguientes siguen por debajo.
    expect(filas[2]?.semaforo).toBe("alerta");
  });

  it("sin mínimo operativo definido, solo alerta si el saldo queda negativo", () => {
    const filas = proyectarCaja({
      hoy,
      saldoInicial: ars("1000"),
      cobros: [],
      pagos: [{ fecha: "2026-08-12", importe: ars("5000") }],
      minimoOperativo: null,
    });
    expect(filas[0]?.semaforo).toBe("ok");
    expect(filas[1]?.saldoFinal.esNegativo()).toBe(true);
    expect(filas[1]?.semaforo).toBe("alerta");
  });
});
