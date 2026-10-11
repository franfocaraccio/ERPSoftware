import { describe, expect, it } from "vitest";
import {
  type Almacen,
  clasesCelda,
  clasesEncabezado,
  guardarDensidad,
  leerDensidad,
} from "./densidad.js";

/** Un localStorage de mentira, para no necesitar un DOM en los tests. */
function almacenFalso(
  inicial: Record<string, string> = {},
): Almacen & { datos: Map<string, string> } {
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

describe("clases por densidad", () => {
  it("la compacta achica el padding en las dos dimensiones", () => {
    // El ancho importa tanto como el alto: `px-4` son 32px por columna, y en
    // una tabla de nueve eso es lo que hace que la info no entre.
    expect(clasesCelda("comoda")).toBe("px-4 py-3");
    expect(clasesCelda("compacta")).toBe("px-2 py-1.5");
  });

  it("los encabezados acompañan a las celdas", () => {
    expect(clasesEncabezado("comoda")).toBe("px-4 py-2.5");
    expect(clasesEncabezado("compacta")).toBe("px-2 py-1.5");
  });

  it("ninguna densidad toca el tamaño del texto", () => {
    // Si alguna vez aparece un `text-` acá, dejó de ser densidad y pasó a ser
    // zoom, que es justamente lo que esto vino a evitar.
    for (const clases of [
      clasesCelda("comoda"),
      clasesCelda("compacta"),
      clasesEncabezado("comoda"),
      clasesEncabezado("compacta"),
    ]) {
      expect(clases).not.toMatch(/text-(xs|sm|base|lg)/);
    }
  });
});

describe("leerDensidad", () => {
  it("sin nada guardado devuelve la cómoda", () => {
    expect(leerDensidad("stock", almacenFalso())).toBe("comoda");
  });

  it("devuelve lo que se haya guardado", () => {
    expect(leerDensidad("stock", almacenFalso({ "erp.densidad.stock": "compacta" }))).toBe(
      "compacta",
    );
  });

  it("un valor basureado no rompe nada", () => {
    expect(leerDensidad("stock", almacenFalso({ "erp.densidad.stock": "gigante" }))).toBe("comoda");
  });

  it("si el almacenamiento falla arranca en cómoda igual", () => {
    expect(leerDensidad("stock", almacenRoto)).toBe("comoda");
  });

  it("sin almacenamiento disponible tampoco explota", () => {
    expect(leerDensidad("stock", null)).toBe("comoda");
  });
});

describe("guardarDensidad", () => {
  it("guarda bajo una clave por tabla", () => {
    const almacen = almacenFalso();
    guardarDensidad("stock", "compacta", almacen);
    expect(almacen.datos.get("erp.densidad.stock")).toBe("compacta");
  });

  it("cada tabla guarda la suya", () => {
    const almacen = almacenFalso();
    guardarDensidad("stock", "compacta", almacen);
    guardarDensidad("clientes", "comoda", almacen);

    expect(leerDensidad("stock", almacen)).toBe("compacta");
    // El pedido era "que cada uno lo ajuste", y eso vale entre pantallas.
    expect(leerDensidad("clientes", almacen)).toBe("comoda");
  });

  it("si no se puede escribir no tira", () => {
    expect(() => guardarDensidad("stock", "compacta", almacenRoto)).not.toThrow();
    expect(() => guardarDensidad("stock", "compacta", null)).not.toThrow();
  });

  it("lo guardado se vuelve a leer igual", () => {
    const almacen = almacenFalso();
    guardarDensidad("stock", "compacta", almacen);
    expect(leerDensidad("stock", almacen)).toBe("compacta");
  });
});
