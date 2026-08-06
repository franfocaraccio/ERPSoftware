import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import { estadoImpuesto, importeDeterminado, saldoImpuesto } from "./impuestos.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("importeDeterminado", () => {
  it("aplica la alícuota sobre la base imponible", () => {
    expect(importeDeterminado(ars("100000"), "21").aStringFiscal()).toBe("21000.00");
  });

  it("soporta alícuotas con decimales", () => {
    expect(importeDeterminado(ars("100000"), "10.5").aStringFiscal()).toBe("10500.00");
  });

  it("redondea el resultado a 2 decimales", () => {
    // 33333.33 × 21% = 6999.9993 → 7000.00
    expect(importeDeterminado(ars("33333.33"), "21").aStringFiscal()).toBe("7000.00");
  });

  it("con alícuota cero el importe es cero", () => {
    expect(importeDeterminado(ars("50000"), "0").esCero()).toBe(true);
  });
});

describe("estadoImpuesto", () => {
  const hoy = "2026-08-05";

  it("es Pagado cuando lo pagado alcanza lo determinado", () => {
    expect(estadoImpuesto(ars("21000"), ars("21000"), "2026-08-20", hoy)).toBe("pagado");
  });

  it("es Pagado si se pagó de más", () => {
    expect(estadoImpuesto(ars("21000"), ars("25000"), "2026-07-20", hoy)).toBe("pagado");
  });

  it("un pago parcial NO alcanza: sigue pendiente", () => {
    expect(estadoImpuesto(ars("21000"), ars("20999.99"), "2026-08-20", hoy)).toBe("pendiente");
  });

  it("es Vencido si no está pago y la fecha ya pasó", () => {
    expect(estadoImpuesto(ars("21000"), ars("0"), "2026-08-04", hoy)).toBe("vencido");
  });

  it("el día del vencimiento todavía es Pendiente, no Vencido", () => {
    expect(estadoImpuesto(ars("21000"), ars("0"), hoy, hoy)).toBe("pendiente");
  });

  it("un impuesto pago no se marca vencido aunque la fecha haya pasado", () => {
    expect(estadoImpuesto(ars("21000"), ars("21000"), "2026-01-01", hoy)).toBe("pagado");
  });

  it("determinado cero cuenta como pagado", () => {
    expect(estadoImpuesto(ars("0"), ars("0"), "2026-01-01", hoy)).toBe("pagado");
  });
});

describe("saldoImpuesto", () => {
  it("es lo que falta pagar", () => {
    expect(saldoImpuesto(ars("21000"), ars("5000")).aStringFiscal()).toBe("16000.00");
  });

  it("nunca es negativo: un pago en exceso deja saldo cero", () => {
    expect(saldoImpuesto(ars("21000"), ars("25000")).esCero()).toBe(true);
  });
});
