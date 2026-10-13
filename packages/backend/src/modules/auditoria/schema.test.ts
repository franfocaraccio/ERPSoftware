import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULOS_AUDITABLES } from "./schema.js";

/** Todos los `.ts` de `src`, sin los tests. */
function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return fuentes(ruta);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [ruta] : [];
  });
}

describe("MODULOS_AUDITABLES", () => {
  it("toda tabla que deja rastro en el audit log tiene un módulo", () => {
    // Sin módulo, el Historial muestra el nombre crudo de la tabla
    // ("movimientos_stock") y el filtro por módulo no la encuentra.
    const mapeadas = new Set<string>(Object.values(MODULOS_AUDITABLES).flatMap((m) => m.tablas));
    const usadas = new Set(
      fuentes(join(import.meta.dirname, "../.."))
        .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/tabla: "([a-z_]+)"/g)])
        .map((m) => m[1] as string),
    );
    expect(usadas.size).toBeGreaterThan(10);
    expect([...usadas].filter((t) => !mapeadas.has(t))).toEqual([]);
  });
});
