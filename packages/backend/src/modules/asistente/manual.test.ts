import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cargarManual } from "./manual.js";

const temporales: string[] = [];

function carpetaTemporal(): string {
  const ruta = mkdtempSync(join(tmpdir(), "manual-"));
  temporales.push(ruta);
  return ruta;
}

afterEach(() => {
  for (const ruta of temporales.splice(0)) {
    rmSync(ruta, { recursive: true, force: true });
  }
});

describe("cargarManual", () => {
  it("carga el manual real del repo", () => {
    // Sin argumento apunta a docs/ayuda. Que este test pase es lo que prueba
    // que el cálculo de la ruta desde el módulo sigue siendo correcto.
    const manual = cargarManual();

    expect(manual.length).toBeGreaterThan(5000);
    expect(manual).toContain("# Generalidades");
  });

  it("concatena los archivos en orden alfabético", () => {
    const dir = carpetaTemporal();
    writeFileSync(join(dir, "02-segundo.md"), "SEGUNDO");
    writeFileSync(join(dir, "01-primero.md"), "PRIMERO");

    const manual = cargarManual(dir);

    expect(manual.indexOf("PRIMERO")).toBeLessThan(manual.indexOf("SEGUNDO"));
  });

  it("ignora los archivos que no son .md", () => {
    const dir = carpetaTemporal();
    writeFileSync(join(dir, "guia.md"), "ESTO SI");
    writeFileSync(join(dir, "notas.txt"), "ESTO NO");

    expect(cargarManual(dir)).not.toContain("ESTO NO");
  });

  it("explota si la carpeta no existe, nombrando el Dockerfile", () => {
    // Es el modo de falla que importa: en el contenedor la carpeta puede no
    // estar, y un manual vacío no se nota — el asistente contesta inventando.
    // Por eso esto tira error en el arranque en vez de seguir de largo.
    expect(() => cargarManual(join(carpetaTemporal(), "no-existe"))).toThrow(/Dockerfile/);
  });

  it("explota si la carpeta está pero no tiene ningún .md", () => {
    expect(() => cargarManual(carpetaTemporal())).toThrow(/vacío/);
  });
});
