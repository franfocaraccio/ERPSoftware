import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import {
  DIAS_PRESENTACION_CHEQUE,
  diasParaCobro,
  diasParaPresentar,
  saldoCuenta,
  signoMovimiento,
} from "./tesoreria.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("signoMovimiento", () => {
  it("un ingreso suma", () => {
    expect(signoMovimiento("ingreso", ars("1000")).aStringFiscal()).toBe("1000.00");
  });

  it("un egreso resta", () => {
    expect(signoMovimiento("egreso", ars("1000")).aStringFiscal()).toBe("-1000.00");
  });
});

describe("saldoCuenta", () => {
  it("es ingresos menos egresos", () => {
    expect(saldoCuenta(ars("150000"), ars("42000.50")).aStringFiscal()).toBe("107999.50");
  });

  it("puede quedar negativo (cuenta en descubierto)", () => {
    const saldo = saldoCuenta(ars("1000"), ars("2500"));
    expect(saldo.esNegativo()).toBe(true);
    expect(saldo.aStringFiscal()).toBe("-1500.00");
  });

  it("sin movimientos el saldo es cero", () => {
    expect(saldoCuenta(Money.cero("ARS"), Money.cero("ARS")).esCero()).toBe(true);
  });
});

describe("diasParaCobro", () => {
  const hoy = "2026-08-05";

  it("cuenta los días que faltan hasta la fecha de pago", () => {
    expect(diasParaCobro("2026-08-20", hoy)).toBe(15);
  });

  it("el mismo día es cero", () => {
    expect(diasParaCobro(hoy, hoy)).toBe(0);
  });

  it("una fecha pasada da negativo", () => {
    expect(diasParaCobro("2026-08-01", hoy)).toBe(-4);
  });

  it("cruza meses correctamente", () => {
    expect(diasParaCobro("2026-09-05", hoy)).toBe(31);
  });

  it("cruza años correctamente", () => {
    expect(diasParaCobro("2027-08-05", hoy)).toBe(365);
  });
});

describe("diasParaPresentar", () => {
  const hoy = "2026-08-05";
  it("un cheque se puede presentar hasta 30 días después de su fecha de pago", () => {
    expect(DIAS_PRESENTACION_CHEQUE).toBe(30);
    // Fecha de pago hace 10 días: quedan 20.
    expect(diasParaPresentar("2026-07-26", hoy)).toBe(20);
  });
  it("el día 30 todavía se puede presentar; el 31, no", () => {
    expect(diasParaPresentar("2026-07-06", hoy)).toBe(0);
    expect(diasParaPresentar("2026-07-05", hoy)).toBe(-1);
  });
  it("un cheque a fecha futura tiene por delante sus días más los 30", () => {
    expect(diasParaPresentar("2026-08-15", hoy)).toBe(40);
  });
});
