import { describe, expect, it } from "vitest";
import { type Almacen, aVisibilidad, guardarEscondidas, leerEscondidas } from "./columnas.js";

/** Un localStorage de mentira, para no necesitar un DOM en los tests. */
function almacenFalso(inicial: Record<string, string> = {}): Almacen & {
  datos: Map<string, string>;
} {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
}

/** Un localStorage que falla, como en una ventana privada. */
const almacenRoto: Almacen = {
  getItem: () => {
    throw new Error("acceso denegado");
  },
  setItem: () => {
    throw new Error("cuota excedida");
  },
};

describe("leerEscondidas", () => {
  it("sin nada guardado no esconde ninguna", () => {
    expect(leerEscondidas("stock", almacenFalso())).toEqual([]);
  });

  it("devuelve lo guardado", () => {
    const almacen = almacenFalso({ "erp.columnas.stock": '["categoria","margenBruto"]' });
    expect(leerEscondidas("stock", almacen)).toEqual(["categoria", "margenBruto"]);
  });

  it("un JSON roto no rompe la pantalla", () => {
    expect(leerEscondidas("stock", almacenFalso({ "erp.columnas.stock": "{no es json" }))).toEqual(
      [],
    );
  });

  it("un contenido con otra forma se ignora", () => {
    // Mostrar de más es recuperable mirando; de menos es invisible.
    const almacen = almacenFalso({ "erp.columnas.stock": '{"categoria":false}' });
    expect(leerEscondidas("stock", almacen)).toEqual([]);
    const conNumeros = almacenFalso({ "erp.columnas.stock": "[1,2,3]" });
    expect(leerEscondidas("stock", conNumeros)).toEqual([]);
  });

  it("si el almacenamiento falla no esconde nada", () => {
    expect(leerEscondidas("stock", almacenRoto)).toEqual([]);
    expect(leerEscondidas("stock", null)).toEqual([]);
  });
});

describe("guardarEscondidas", () => {
  it("guarda bajo una clave por tabla", () => {
    const almacen = almacenFalso();
    guardarEscondidas("stock", ["categoria"], almacen);
    expect(almacen.datos.get("erp.columnas.stock")).toBe('["categoria"]');
  });

  it("cada tabla guarda la suya", () => {
    const almacen = almacenFalso();
    guardarEscondidas("stock", ["categoria"], almacen);
    guardarEscondidas("clientes", ["email"], almacen);

    expect(leerEscondidas("stock", almacen)).toEqual(["categoria"]);
    expect(leerEscondidas("clientes", almacen)).toEqual(["email"]);
  });

  it("si no se puede escribir no tira", () => {
    expect(() => guardarEscondidas("stock", ["categoria"], almacenRoto)).not.toThrow();
    expect(() => guardarEscondidas("stock", ["categoria"], null)).not.toThrow();
  });

  it("lo guardado se vuelve a leer igual", () => {
    const almacen = almacenFalso();
    guardarEscondidas("stock", ["a", "b"], almacen);
    expect(leerEscondidas("stock", almacen)).toEqual(["a", "b"]);
  });
});

describe("aVisibilidad", () => {
  it("marca como no visibles solo las escondidas", () => {
    expect(aVisibilidad(["categoria", "margenBruto"])).toEqual({
      categoria: false,
      margenBruto: false,
    });
  });

  it("sin escondidas el mapa va vacío", () => {
    // Lo que no está en el mapa, TanStack lo considera visible. Por eso una
    // columna nueva aparece sola, incluso para quien ya tenía preferencias.
    expect(aVisibilidad([])).toEqual({});
  });
});
