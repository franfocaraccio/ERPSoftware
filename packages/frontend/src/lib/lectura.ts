const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Lo que el backend no pudo entender, o entendió pero no cierra. */
export type Reparo =
  | { campo: string; motivo: "ilegible" }
  | { campo: "total"; motivo: "no_cierra"; esperado: string }
  | { campo: "iva"; motivo: "sin_discriminar" };

export interface CompraPropuesta {
  emisorRazonSocial: string;
  emisorCuit: string | null;
  letra: "A" | "B" | "C" | "E" | null;
  numeroCompleto: string | null;
  fechaEmision: string | null;
  concepto: string;
  neto: string | null;
  iva: string | null;
  total: string | null;
  reparos: Reparo[];
}

export interface ItemLeido {
  descripcion: string;
  cantidad: string | null;
  precioUnitario: string | null;
  alicuotaIva: string | null;
}

export interface VentaPropuesta {
  receptorRazonSocial: string;
  receptorCuit: string | null;
  clase: "factura" | "nota_credito" | "nota_debito";
  letraLeida: "A" | "B" | "C" | "E" | null;
  puntoVenta: number | null;
  numero: number | null;
  fechaEmision: string | null;
  cae: string | null;
  caeVencimiento: string | null;
  items: ItemLeido[];
  /** Lo que dice el papel. No se guarda: sirve para contrastar la lectura. */
  totalImpreso: string | null;
  reparos: Reparo[];
}

interface Archivo {
  nombre: string;
  hash: string;
}

export interface LecturaCompra {
  tipo: "compra";
  propuesta: CompraPropuesta;
  /** El proveedor ya cargado que tiene el CUIT leído, si existe. */
  contraparteId: string | null;
  archivo: Archivo;
}

export interface LecturaVenta {
  tipo: "venta";
  propuesta: VentaPropuesta;
  /** El cliente ya cargado que tiene el CUIT leído, si existe. */
  contraparteId: string | null;
  archivo: Archivo;
}

export type Lectura = LecturaCompra | LecturaVenta;

/**
 * Manda el archivo al backend para que lo lea.
 *
 * Va por `fetch` y no por tRPC porque tRPC habla JSON y esto manda un archivo.
 * El archivo **no se guarda**: el backend lo lee y lo descarta.
 *
 * `credentials: "include"` porque la sesión viaja en cookie y el backend está
 * en otro dominio.
 */
export async function leerComprobante(archivo: File, tipo: "compra"): Promise<LecturaCompra>;
export async function leerComprobante(archivo: File, tipo: "venta"): Promise<LecturaVenta>;
export async function leerComprobante(archivo: File, tipo: "compra" | "venta"): Promise<Lectura> {
  const cuerpo = new FormData();
  cuerpo.append("archivo", archivo);
  // Qué se arma con lo leído lo decide quien pide, no el papel: la misma
  // factura es una compra para uno y una venta para el otro.
  cuerpo.append("tipo", tipo);

  const respuesta = await fetch(`${API}/api/comprobantes/leer`, {
    method: "POST",
    body: cuerpo,
    credentials: "include",
  });

  if (!respuesta.ok) {
    const detalle: unknown = await respuesta.json().catch(() => null);
    const mensaje =
      typeof detalle === "object" && detalle !== null && "error" in detalle
        ? String((detalle as { error: unknown }).error)
        : "No se pudo leer el comprobante.";
    throw new Error(mensaje);
  }

  return (await respuesta.json()) as Lectura;
}

/** El texto que se le muestra a la persona al lado del campo con problema. */
export function textoReparo(reparo: Reparo): string {
  switch (reparo.motivo) {
    case "ilegible":
      return "No se pudo leer del archivo. Completalo a mano.";
    case "no_cierra":
      return `No cierra: con el neto y el IVA leídos daría ${reparo.esperado}.`;
    case "sin_discriminar":
      return "En una factura B o C el IVA va incluido en el precio. Revisá si corresponde.";
  }
}
