/**
 * Qué es un archivo, leído de sus primeros bytes.
 *
 * Ni la extensión ni el `Content-Type` que manda el navegador dicen nada: los
 * dos los elige quien sube el archivo. Un `.pdf` puede ser un HTML con un
 * script adentro, y si después se sirve con el tipo que declaró, el navegador
 * de quien lo baje lo ejecuta. Lo único que no se puede disfrazar sin dejar de
 * ser ese formato es la firma con la que empieza.
 *
 * La lista es corta a propósito: son los formatos en que llega un comprobante
 * escaneado o un PDF de un banco. Los extractos en CSV o Excel (tarea 3) no
 * tienen una firma así —un CSV es texto y un XLSX es un ZIP— y necesitan su
 * propia validación cuando se sumen.
 */
const FIRMAS = [
  { tipo: "application/pdf", firma: [0x25, 0x50, 0x44, 0x46, 0x2d], desde: 0 }, // %PDF-
  { tipo: "image/png", firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], desde: 0 },
  { tipo: "image/jpeg", firma: [0xff, 0xd8, 0xff], desde: 0 },
] as const;

export const TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type TipoPermitido = (typeof TIPOS_PERMITIDOS)[number];

function empiezaCon(bytes: Uint8Array, firma: readonly number[], desde: number): boolean {
  if (bytes.length < desde + firma.length) {
    return false;
  }
  return firma.every((b, i) => bytes[desde + i] === b);
}

/** El tipo del archivo, o null si no es ninguno de los permitidos. */
export function detectarTipo(bytes: Uint8Array): TipoPermitido | null {
  for (const { tipo, firma, desde } of FIRMAS) {
    if (empiezaCon(bytes, firma, desde)) {
      return tipo;
    }
  }
  // WebP es un contenedor RIFF: "RIFF", cuatro bytes de largo, "WEBP". El
  // "RIFF" solo no alcanza, porque también es la firma de WAV y AVI.
  if (
    empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46], 0) &&
    empiezaCon(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}
