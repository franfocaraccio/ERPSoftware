import { describe, expect, it } from "vitest";
import { permitidoPorLink } from "./modulos.js";

describe("permitidoPorLink", () => {
  const contador = ["panel", "impuestos"];

  it("deja pasar los módulos elegidos", () => {
    expect(permitidoPorLink("impuestos.listar", contador)).toBe(true);
    expect(permitidoPorLink("financiero.resumen", contador)).toBe(true);
  });

  it("niega los que no se eligieron", () => {
    expect(permitidoPorLink("clientes.listar", contador)).toBe(false);
    expect(permitidoPorLink("cuentaCorriente.cliente", contador)).toBe(false);
  });

  it("los parámetros los leen todas las pantallas", () => {
    expect(permitidoPorLink("parametros.obtener", [])).toBe(true);
  });

  it("un router que nadie mapeó se niega", () => {
    expect(permitidoPorLink("algoNuevo.listar", [...contador, "clientes"])).toBe(false);
  });

  it("las fichas siguen al módulo de su contraparte", () => {
    expect(permitidoPorLink("cuentaCorriente.proveedor", ["proveedores"])).toBe(true);
  });
});
