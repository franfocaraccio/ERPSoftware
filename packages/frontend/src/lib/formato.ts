/**
 * Formateo para mostrar. El dinero llega como string desde tRPC y se formatea
 * sin convertirlo a number para operar (regla dura: nada de aritmética con
 * float sobre importes).
 */
const FORMATO_ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export function formatearImporte(valor: string | null): string {
  if (valor === null) {
    return "—";
  }
  return FORMATO_ARS.format(Number(valor));
}

const ETIQUETAS_CONDICION_IVA: Record<string, string> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
  consumidor_final: "Consumidor Final",
};

export function etiquetaCondicionIva(valor: string): string {
  return ETIQUETAS_CONDICION_IVA[valor] ?? valor;
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  en_mora: "En mora",
};

export function etiquetaEstado(valor: string): string {
  return ETIQUETAS_ESTADO[valor] ?? valor;
}

const FORMATO_CANTIDAD = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/** Cantidades (no dinero): hasta 3 decimales, sin ceros de relleno. */
export function formatearCantidad(valor: string): string {
  return FORMATO_CANTIDAD.format(Number(valor));
}

/** Fechas ISO (2026-08-31) → 31/08/2026, sin pasar por Date para no correr el huso. */
export function formatearFecha(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso;
}

/** 30703088534 → 30-70308853-4 */
export function formatearCuit(cuit: string | null): string {
  if (cuit?.length !== 11) {
    return cuit ?? "—";
  }
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
