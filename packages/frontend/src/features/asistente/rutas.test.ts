import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUTAS } from "./rutas.js";

/**
 * El asistente se apoya en dos listas escritas a mano que el compilador no
 * relaciona con nada: la lista blanca de rutas linkeables y el manual de
 * `docs/ayuda`. Las dos pueden quedar viejas sin que falle ni un typecheck ni
 * un test, y cuando eso pasa el asistente no se rompe: sigue contestando, con
 * total seguridad, algo que ya no es cierto. Ese es el modo de falla que estos
 * checks existen para atajar.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(AQUI, "..", "..", "..");
const RAIZ = join(FRONTEND, "..", "..");

const ROUTER = readFileSync(join(FRONTEND, "src", "router.tsx"), "utf8");
const LAYOUT = readFileSync(join(FRONTEND, "src", "components", "layout.tsx"), "utf8");
const DIR_AYUDA = join(RAIZ, "docs", "ayuda");

/** Rutas declaradas en el árbol de TanStack Router. La fuente de verdad. */
const RUTAS_DEL_ROUTER = [...ROUTER.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1] as string);

/** Destinos del menú lateral: `{ a: "/panel", etiqueta: "Panel", ... }`. */
const RUTAS_DEL_MENU = [...LAYOUT.matchAll(/\ba:\s*"(\/[^"]*)"/g)].map((m) => m[1] as string);

/**
 * `/clientes/$clienteId` en el router y `/clientes/{id}` en el manual son la
 * misma pantalla escrita distinto. Se comparan por forma, no por texto.
 */
function patron(ruta: string): string {
  return ruta
    .split("/")
    .map((tramo) => (tramo.startsWith("$") || /^\{.*\}$/.test(tramo) ? "*" : tramo))
    .join("/");
}

const PATRONES_DEL_ROUTER = new Set(RUTAS_DEL_ROUTER.map(patron));

/** Rutas citadas en el manual: siempre entre backticks (`/clientes/nuevo`). */
function rutasCitadasEnElManual(): { archivo: string; ruta: string }[] {
  return readdirSync(DIR_AYUDA)
    .filter((n) => n.endsWith(".md"))
    .flatMap((archivo) => {
      const texto = readFileSync(join(DIR_AYUDA, archivo), "utf8");
      return [...texto.matchAll(/`(\/[a-zA-Z0-9/{}$_-]*)`/g)].map((m) => ({
        archivo,
        ruta: m[1] as string,
      }));
    });
}

describe("el árbol de rutas se pudo leer", () => {
  it("encuentra rutas en el router y en el menú", () => {
    // Si alguna de las dos extracciones deja de matchear —porque cambió la
    // forma de declarar rutas— el resto de los checks pasarían vacíos y no
    // verificarían nada. Esto es la alarma de que el check se quedó ciego.
    expect(RUTAS_DEL_ROUTER.length).toBeGreaterThan(10);
    expect(RUTAS_DEL_MENU.length).toBeGreaterThan(5);
  });
});

describe("lista blanca del asistente", () => {
  it("todas sus rutas existen en el router", () => {
    const inexistentes = RUTAS.filter((ruta) => !RUTAS_DEL_ROUTER.includes(ruta));

    expect(
      inexistentes,
      `Estas rutas están en la lista blanca pero no en el router: el asistente las va a ` +
        `nombrar y el link no va a llevar a ningún lado. Sacalas de rutas.ts o agregalas ` +
        `al router.`,
    ).toEqual([]);
  });

  it("no incluye rutas con parámetro, que no se pueden linkear sin un id", () => {
    expect(RUTAS.filter((r) => r.includes("$") || r.includes("{"))).toEqual([]);
  });

  it("cubre todos los destinos del menú lateral", () => {
    // Si se agrega un módulo al menú y nadie toca la lista, el asistente puede
    // explicar la pantalla pero no llevar a nadie hasta ella.
    const faltantes = RUTAS_DEL_MENU.filter((ruta) => !(RUTAS as readonly string[]).includes(ruta));

    expect(
      faltantes,
      `Estos destinos están en el menú pero el asistente no los puede linkear. ` +
        `Agregalos a features/asistente/rutas.ts.`,
    ).toEqual([]);
  });
});

describe("manual de docs/ayuda", () => {
  it("no cita ninguna ruta que no exista", () => {
    const rotas = rutasCitadasEnElManual().filter(
      ({ ruta }) => !PATRONES_DEL_ROUTER.has(patron(ruta)),
    );

    expect(
      rotas.map(({ archivo, ruta }) => `${archivo}: ${ruta}`),
      `El manual manda a pantallas que no existen. Como viaja entero en el prompt, ` +
        `el asistente va a repetir esas rutas como si fueran válidas.`,
    ).toEqual([]);
  });

  it("documenta todos los destinos del menú lateral", () => {
    const texto = readdirSync(DIR_AYUDA)
      .filter((n) => n.endsWith(".md"))
      .map((n) => readFileSync(join(DIR_AYUDA, n), "utf8"))
      .join("\n");

    const sinDocumentar = RUTAS_DEL_MENU.filter((ruta) => !texto.includes(`\`${ruta}\``));

    expect(
      sinDocumentar,
      `Estas pantallas están en el menú y no aparecen en docs/ayuda. El asistente no ` +
        `sabe que existen: si le preguntan por ellas, va a decir que no las tiene ` +
        `documentadas.`,
    ).toEqual([]);
  });
});
