import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { actualizarImpuesto, crearImpuesto, listarImpuestos, obtenerImpuesto } from "./service.js";

const tenantA = { tenantId: `test-${randomUUID()}`, usuarioId: "test-user" };
const tenantB = { tenantId: `test-${randomUUID()}`, usuarioId: "test-user" };

const listar = () => listarImpuestos(tenantA, { soloImpagos: false, pagina: 1, tamanoPagina: 50 });

afterAll(async () => {
  await pool.end();
});

describe("impuestos service (integración, RLS activo)", () => {
  it("calcula el importe determinado desde base y alícuota", async () => {
    await crearImpuesto(tenantA, {
      tipo: "iva",
      periodo: "2026-07",
      baseImponible: "100000.00",
      alicuota: "21",
      importePagado: "0",
      // Vencimiento muy futuro: no debe marcarse vencido.
      fechaVencimiento: "2099-08-20",
    });

    const { items } = await listar();
    expect(items[0]?.importeDeterminado).toBe("21000.00");
    expect(items[0]?.saldo).toBe("21000.00");
    expect(items[0]?.estado).toBe("pendiente");
  });

  it("marca vencido cuando la fecha ya pasó y no está pago", async () => {
    await crearImpuesto(tenantA, {
      tipo: "iibb",
      periodo: "2020-01",
      baseImponible: "50000.00",
      alicuota: "3.5",
      importePagado: "0",
      fechaVencimiento: "2020-02-15",
    });

    const { items, cantidadVencidos } = await listar();
    const vencido = items.find((i) => i.tipo === "iibb");
    expect(vencido?.importeDeterminado).toBe("1750.00");
    expect(vencido?.estado).toBe("vencido");
    expect(cantidadVencidos).toBe(1);
  });

  it("un pago total marca pagado aunque la fecha haya pasado", async () => {
    await crearImpuesto(tenantA, {
      tipo: "ganancias",
      periodo: "2020-01",
      baseImponible: "200000.00",
      alicuota: "10",
      importePagado: "20000.00",
      fechaVencimiento: "2020-05-15",
    });

    const { items } = await listar();
    const pagado = items.find((i) => i.tipo === "ganancias");
    expect(pagado?.estado).toBe("pagado");
    expect(pagado?.saldo).toBe("0.00");
  });

  it("un pago parcial deja saldo y sigue impago", async () => {
    await crearImpuesto(tenantA, {
      tipo: "monotributo",
      periodo: "2026-07",
      baseImponible: "30000.00",
      alicuota: "10",
      importePagado: "1000.00",
      fechaVencimiento: "2099-08-20",
    });

    const { items } = await listar();
    const parcial = items.find((i) => i.tipo === "monotributo");
    expect(parcial?.importeDeterminado).toBe("3000.00");
    expect(parcial?.saldo).toBe("2000.00");
    expect(parcial?.estado).toBe("pendiente");
  });

  it("el filtro de impagos excluye los pagados y suma lo adeudado", async () => {
    const { items, totalAdeudado } = await listarImpuestos(tenantA, {
      soloImpagos: true,
      pagina: 1,
      tamanoPagina: 50,
    });
    expect(items.every((i) => i.estado !== "pagado")).toBe(true);
    // 21000 (IVA) + 1750 (IIBB) + 2000 (monotributo)
    expect(totalAdeudado).toBe("24750.00");
  });

  it("filtra por tipo de impuesto", async () => {
    const { items } = await listarImpuestos(tenantA, {
      tipo: "iva",
      soloImpagos: false,
      pagina: 1,
      tamanoPagina: 50,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.tipo).toBe("iva");
  });

  it("normaliza el período al primer día del mes", async () => {
    const { items } = await listarImpuestos(tenantA, {
      tipo: "iva",
      soloImpagos: false,
      pagina: 1,
      tamanoPagina: 1,
    });
    expect(items[0]?.periodo).toBe("2026-07-01");
  });

  it("el aislamiento RLS impide ver obligaciones de otro tenant", async () => {
    const { total } = await listarImpuestos(tenantB, {
      soloImpagos: false,
      pagina: 1,
      tamanoPagina: 50,
    });
    expect(total).toBe(0);
  });

  it("obtener y actualizar desde otro tenant devuelven null", async () => {
    const { items } = await listar();
    const id = items[0]?.id ?? "";
    expect(await obtenerImpuesto(tenantB, id)).toBeNull();
    expect(
      await actualizarImpuesto(tenantB, {
        id,
        datos: {
          tipo: "otros",
          periodo: "2026-01",
          baseImponible: "1.00",
          alicuota: "1",
          importePagado: "0",
          fechaVencimiento: "2026-01-31",
        },
      }),
    ).toBeNull();
  });
});
