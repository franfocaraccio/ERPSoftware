import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Raíz del monorepo. Cinco niveles arriba de este archivo
 * (modules/asistente → modules → src → backend → packages → raíz), y el
 * cálculo da igual en local que dentro del contenedor, donde la raíz es /app.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

const DIRECTORIO = join(RAIZ, "docs", "ayuda");

/**
 * Manual de uso de la aplicación, concatenado desde `docs/ayuda`.
 *
 * Va entero en el prompt en vez de trocearse en una base vectorial: son unas
 * pocas decenas de miles de caracteres, entran de sobra en la ventana, y como
 * el bloque no cambia nunca el proveedor lo cachea y a partir del segundo
 * mensaje cuesta una fracción. Un RAG acá agregaría un modo de falla nuevo —que
 * el retriever no traiga el fragmento correcto— sin resolver ningún problema.
 *
 * Se lee una vez al arrancar. Editar un .md exige reiniciar el backend.
 */
export function cargarManual(): string {
  let archivos: string[];
  try {
    archivos = readdirSync(DIRECTORIO)
      .filter((n) => n.endsWith(".md"))
      .sort();
  } catch (error) {
    throw new Error(
      `No se pudo leer el manual del asistente en ${DIRECTORIO}. ` +
        `Si esto pasa en un contenedor, revisá que el Dockerfile copie la carpeta docs. ` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (archivos.length === 0) {
    throw new Error(`El manual del asistente está vacío: no hay .md en ${DIRECTORIO}`);
  }

  return archivos
    .map((nombre) => readFileSync(join(DIRECTORIO, nombre), "utf8").trim())
    .join("\n\n---\n\n");
}
