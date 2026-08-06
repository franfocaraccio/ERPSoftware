import { describe, expect, it } from "vitest";
import { Money } from "../money/index.js";
import {
  cicloConversionEfectivo,
  concentracionLibrador,
  diasRotacionStock,
  dpo,
  dso,
  liquidezCorriente,
  margenBrutoPorcentual,
  semaforoDe,
} from "./kpis.js";

const ars = (v: string) => Money.desdeString(v, "ARS");

describe("liquidezCorriente", () => {
  it("es activo corriente sobre pasivo corriente", () => {
    // (100000 + 50000) / 100000 = 1.5
    expect(liquidezCorriente(ars("100000"), ars("50000"), ars("100000"))).toBe("1.50");
  });

  it("marca el riesgo cuando no llega a 1", () => {
    expect(liquidezCorriente(ars("10000"), ars("10000"), ars("40000"))).toBe("0.50");
  });

  it("sin deudas a pagar no se puede dividir: devuelve null", () => {
    expect(liquidezCorriente(ars("100000"), ars("0"), ars("0"))).toBeNull();
  });
});

describe("dso", () => {
  it("convierte el saldo por cobrar en días de venta", () => {
    // (300000 / 900000) × 30 = 10 días
    expect(dso(ars("300000"), ars("900000"))).toBe(10);
  });

  it("redondea al día más cercano", () => {
    expect(dso(ars("100000"), ars("900000"))).toBe(3);
  });

  it("sin ventas en el período no es calculable", () => {
    expect(dso(ars("300000"), ars("0"))).toBeNull();
  });

  it("sin saldo pendiente es cero", () => {
    expect(dso(ars("0"), ars("900000"))).toBe(0);
  });

  it("un saldo a favor del cliente no da días negativos: no hay nada por cobrar", () => {
    expect(dso(ars("-50000"), ars("900000"))).toBe(0);
  });
});

describe("dpo", () => {
  it("convierte el saldo a pagar en días de compra", () => {
    expect(dpo(ars("200000"), ars("600000"))).toBe(10);
  });

  it("sin compras en el período no es calculable", () => {
    expect(dpo(ars("200000"), ars("0"))).toBeNull();
  });

  it("un saldo a favor nuestro no da días negativos", () => {
    expect(dpo(ars("-20000"), ars("600000"))).toBe(0);
  });
});

describe("diasRotacionStock", () => {
  it("son los días que tarda en salir el stock promedio", () => {
    // 30 / (200 / 100) = 15 días
    expect(diasRotacionStock("200", "100")).toBe(15);
  });

  it("sin salidas el stock no rota: no es calculable", () => {
    expect(diasRotacionStock("0", "100")).toBeNull();
  });

  it("sin stock promedio no es calculable", () => {
    expect(diasRotacionStock("200", "0")).toBeNull();
  });
});

describe("cicloConversionEfectivo", () => {
  it("es DSO más rotación menos DPO", () => {
    expect(cicloConversionEfectivo(30, 15, 20)).toBe(25);
  });

  it("puede ser negativo si se cobra antes de pagar", () => {
    expect(cicloConversionEfectivo(10, 5, 45)).toBe(-30);
  });

  it("si falta cualquiera de los tres no es calculable", () => {
    expect(cicloConversionEfectivo(null, 15, 20)).toBeNull();
    expect(cicloConversionEfectivo(30, null, 20)).toBeNull();
    expect(cicloConversionEfectivo(30, 15, null)).toBeNull();
  });
});

describe("margenBrutoPorcentual", () => {
  it("es (ventas menos costo) sobre ventas", () => {
    expect(margenBrutoPorcentual(ars("1000000"), ars("600000"))).toBe("40.00");
  });

  it("un costo mayor a la venta da margen negativo", () => {
    expect(margenBrutoPorcentual(ars("100000"), ars("150000"))).toBe("-50.00");
  });

  it("sin ventas no es calculable", () => {
    expect(margenBrutoPorcentual(ars("0"), ars("0"))).toBeNull();
  });
});

describe("concentracionLibrador", () => {
  it("devuelve el porcentaje del librador más grande", () => {
    const r = concentracionLibrador([
      { librador: "ACME", importe: ars("60000") },
      { librador: "Otro", importe: ars("40000") },
    ]);
    expect(r).toEqual({ librador: "ACME", porcentaje: "60.00" });
  });

  it("suma los cheques del mismo librador", () => {
    const r = concentracionLibrador([
      { librador: "ACME", importe: ars("30000") },
      { librador: "ACME", importe: ars("30000") },
      { librador: "Otro", importe: ars("40000") },
    ]);
    expect(r?.porcentaje).toBe("60.00");
  });

  it("sin cheques devuelve null", () => {
    expect(concentracionLibrador([])).toBeNull();
  });
});

describe("semaforoDe", () => {
  it("verde cuando el valor está del lado bueno del umbral", () => {
    expect(semaforoDe(1.5, { umbral: 1, direccion: "mayor_es_mejor" })).toBe("ok");
  });

  it("rojo cuando lo cruza", () => {
    expect(semaforoDe(0.8, { umbral: 1, direccion: "mayor_es_mejor" })).toBe("alerta");
  });

  it("estar justo en el umbral todavía es aceptable", () => {
    expect(semaforoDe(1, { umbral: 1, direccion: "mayor_es_mejor" })).toBe("ok");
    expect(semaforoDe(60, { umbral: 60, direccion: "menor_es_mejor" })).toBe("ok");
  });

  it("funciona al revés cuando menos es mejor", () => {
    expect(semaforoDe(75, { umbral: 60, direccion: "menor_es_mejor" })).toBe("alerta");
    expect(semaforoDe(45, { umbral: 60, direccion: "menor_es_mejor" })).toBe("ok");
  });

  it("un valor que no se pudo calcular no tiene semáforo", () => {
    expect(semaforoDe(null, { umbral: 1, direccion: "mayor_es_mejor" })).toBe("sin_datos");
  });
});
