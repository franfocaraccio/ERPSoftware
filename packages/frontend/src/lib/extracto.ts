const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Una línea del extracto que todavía no se resolvió. */
export interface PropuestaLinea {
  indice: number;
  fecha: string;
  descripcion: string;
  /** Con signo: negativo es un débito. */
  importe: string;
  saldo: string;
  resultado: "casa" | "ambigua" | "sin_par";
  movimientoId: string | null;
  candidatos: string[];
  /** La contraparte que ya existe con el CUIT que imprime el banco. */
  sugerencia: { contraparte: "cliente" | "proveedor"; id: string; nombre: string } | null;
}

export interface MovimientoResumen {
  id: string;
  fecha: string;
  tipo: "ingreso" | "egreso";
  importe: string;
  concepto: string | null;
}

export interface Propuesta {
  /** Lo que el banco imprime arriba: banco, cuenta, período. */
  cuenta: string[];
  saldo:
    | { ok: true; inicial: string; final: string }
    | { ok: false; indice: number; esperado: string; leido: string };
  filasIlegibles: { fila: number; motivo: "importe" | "saldo" }[];
  yaResueltas: number;
  lineas: PropuestaLinea[];
  sinLinea: string[];
  movimientos: Record<string, MovimientoResumen>;
  archivo: { nombre: string; hash: string };
}

/**
 * Sube el extracto y devuelve la propuesta de conciliación.
 *
 * Va por `fetch` y no por tRPC porque manda un archivo. El archivo no se
 * guarda: el backend lo lee, propone y lo descarta. Confirmar sí va por tRPC.
 */
export async function subirExtracto(archivo: File, cuentaId: string): Promise<Propuesta> {
  const cuerpo = new FormData();
  cuerpo.append("archivo", archivo);
  cuerpo.append("cuentaId", cuentaId);

  const respuesta = await fetch(`${API}/api/tesoreria/extracto`, {
    method: "POST",
    body: cuerpo,
    credentials: "include",
  });

  if (!respuesta.ok) {
    const detalle: unknown = await respuesta.json().catch(() => null);
    const mensaje =
      typeof detalle === "object" && detalle !== null && "error" in detalle
        ? String((detalle as { error: unknown }).error)
        : "No se pudo leer el extracto.";
    throw new Error(mensaje);
  }

  return (await respuesta.json()) as Propuesta;
}
