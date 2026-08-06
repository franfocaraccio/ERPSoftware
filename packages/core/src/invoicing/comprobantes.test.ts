import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import {
  calcularComprobante,
  discriminaIva,
  type LineaItem,
  letraPermitida,
} from "./comprobantes.js";

const item = (cantidad: string, precio: string, alicuota: LineaItem["alicuotaIva"]): LineaItem => ({
  cantidad,
  precioUnitario: precio,
  alicuotaIva: alicuota,
});

describe("letraPermitida", () => {
  it("un RI le factura A a otro RI", () => {
    expect(letraPermitida("responsable_inscripto", "responsable_inscripto")).toBe("A");
  });

  it("un RI le factura B a monotributo, exento y consumidor final", () => {
    expect(letraPermitida("responsable_inscripto", "monotributo")).toBe("B");
    expect(letraPermitida("responsable_inscripto", "exento")).toBe("B");
    expect(letraPermitida("responsable_inscripto", "consumidor_final")).toBe("B");
  });

  it("un monotributista emite siempre C, sin importar el receptor", () => {
    expect(letraPermitida("monotributo", "responsable_inscripto")).toBe("C");
    expect(letraPermitida("monotributo", "consumidor_final")).toBe("C");
  });

  it("un exento emite siempre C", () => {
    expect(letraPermitida("exento", "responsable_inscripto")).toBe("C");
  });
});

describe("discriminaIva", () => {
  it("solo la A discrimina IVA", () => {
    expect(discriminaIva("A")).toBe(true);
    expect(discriminaIva("B")).toBe(false);
    expect(discriminaIva("C")).toBe(false);
    expect(discriminaIva("E")).toBe(false);
  });
});

describe("calcularComprobante", () => {
  it("calcula neto, IVA y total de un ítem con 21%", () => {
    const r = calcularComprobante([item("1", "100000", "21")], "ARS");
    expect(r.neto.aStringFiscal()).toBe("100000.00");
    expect(r.iva.aStringFiscal()).toBe("21000.00");
    expect(r.total.aStringFiscal()).toBe("121000.00");
  });

  it("multiplica cantidad por precio unitario", () => {
    const r = calcularComprobante([item("3", "1500.50", "21")], "ARS");
    expect(r.neto.aStringFiscal()).toBe("4501.50");
    expect(r.iva.aStringFiscal()).toBe("945.32"); // 4501.50 × 21% = 945.315 → 945.32
    expect(r.total.aStringFiscal()).toBe("5446.82");
  });

  it("agrupa por alícuota, como espera WSFEv1", () => {
    const r = calcularComprobante(
      [item("1", "100000", "21"), item("1", "50000", "10.5"), item("2", "1000", "21")],
      "ARS",
    );
    expect(r.porAlicuota).toHaveLength(2);

    const g21 = r.porAlicuota.find((g) => g.alicuota === "21");
    expect(g21?.baseImponible.aStringFiscal()).toBe("102000.00");
    expect(g21?.importe.aStringFiscal()).toBe("21420.00");

    const g105 = r.porAlicuota.find((g) => g.alicuota === "10.5");
    expect(g105?.baseImponible.aStringFiscal()).toBe("50000.00");
    expect(g105?.importe.aStringFiscal()).toBe("5250.00");
  });

  it("el total cierra exactamente con la suma de los grupos redondeados", () => {
    // Cada grupo redondea por separado; el total NO se redondea aparte.
    const r = calcularComprobante(
      [item("1", "33.33", "21"), item("1", "66.67", "10.5"), item("1", "10.01", "27")],
      "ARS",
    );
    const sumaGrupos = r.porAlicuota.reduce((acc, g) => acc.sumar(g.importe), Money.cero("ARS"));
    expect(r.iva.igualA(sumaGrupos)).toBe(true);
    expect(r.total.igualA(r.neto.sumar(r.iva))).toBe(true);
  });

  it("los ítems exentos y no gravados suman al neto pero no generan IVA", () => {
    const r = calcularComprobante(
      [item("1", "10000", "exento"), item("1", "5000", "no_gravado")],
      "ARS",
    );
    expect(r.neto.aStringFiscal()).toBe("15000.00");
    expect(r.iva.esCero()).toBe(true);
    expect(r.total.aStringFiscal()).toBe("15000.00");
    // No se declaran como grupos de IVA con importe.
    expect(r.porAlicuota).toHaveLength(0);
  });

  it("la alícuota 0% genera un grupo con base pero importe cero", () => {
    const r = calcularComprobante([item("1", "10000", "0")], "ARS");
    expect(r.porAlicuota).toHaveLength(1);
    expect(r.porAlicuota[0]?.baseImponible.aStringFiscal()).toBe("10000.00");
    expect(r.porAlicuota[0]?.importe.esCero()).toBe(true);
  });

  it("sin ítems todo es cero", () => {
    const r = calcularComprobante([], "ARS");
    expect(r.neto.esCero()).toBe(true);
    expect(r.iva.esCero()).toBe(true);
    expect(r.total.esCero()).toBe(true);
  });

  it("respeta la moneda del comprobante", () => {
    const r = calcularComprobante([item("1", "100", "21")], "USD");
    expect(r.total.moneda).toBe("USD");
  });

  it("acumula el redondeo por grupo, no por ítem", () => {
    // Tres ítems de 33.33 al 21%: por ítem daría 6.9993 → 7.00 cada uno = 21.00.
    // Agrupado: 99.99 × 21% = 20.9979 → 21.00. Coincide, pero la base es una sola.
    const r = calcularComprobante(
      [item("1", "33.33", "21"), item("1", "33.33", "21"), item("1", "33.33", "21")],
      "ARS",
    );
    expect(r.porAlicuota[0]?.baseImponible.aStringFiscal()).toBe("99.99");
    expect(r.iva.aStringFiscal()).toBe("21.00");
  });
});
