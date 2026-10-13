import { Boton } from "@erp/design-system";
import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { type Lectura, leerComprobante } from "../lib/lectura.js";

/**
 * Subir un comprobante y que lo lea.
 *
 * El archivo **no se guarda**: viaja, se lee y se descarta. Lo que vuelve es
 * un formulario precargado que una persona confirma; nada se carga solo.
 *
 * Sirve para los dos lados del mostrador. Lo que cambia es `tipo`: la misma
 * factura es una compra para quien la recibe y una venta para quien la emitió,
 * y de eso depende si la contraparte es el emisor o el receptor.
 */
export function BotonLeerComprobante<T extends Lectura>({
  tipo,
  onLeido,
}: {
  tipo: T["tipo"];
  onLeido: (lectura: T) => void;
}) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Se limpia enseguida para que elegir el mismo archivo otra vez vuelva a
    // disparar el change.
    e.target.value = "";
    if (!archivo) {
      return;
    }
    setError(null);
    setLeyendo(true);
    try {
      const lectura =
        tipo === "venta"
          ? await leerComprobante(archivo, "venta")
          : await leerComprobante(archivo, "compra");
      onLeido(lectura as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el comprobante.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <>
      <input
        ref={entradaRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => void alElegir(e)}
      />
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={leyendo}
        onClick={() => entradaRef.current?.click()}
      >
        <FileUp className="size-4" aria-hidden="true" />
        {leyendo ? "Leyendo…" : "Leer de un archivo"}
      </Boton>
      {error !== null && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );
}
