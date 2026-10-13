import { hoyEnArgentina } from "@erp/core/dates";
import { Boton, Selector } from "@erp/design-system";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { cabeceraAcceso } from "../../lib/acceso-consolidado.js";
import { formatearPeriodo } from "../../lib/formato.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Los últimos 12 meses cerrados, del más reciente al más viejo (`YYYY-MM`). */
function mesesCerrados(hoy: string): string[] {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const total = a * 12 + (m - 1) - (i + 1);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/**
 * Baja el informe ejecutivo del mes en PDF. Lo arma el servidor en el momento
 * con los mismos datos que se ven en la app; no queda guardado en ningún lado.
 */
export function DescargarInforme() {
  const meses = mesesCerrados(hoyEnArgentina());
  const [periodo, setPeriodo] = useState(meses[0] ?? "");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setCargando(true);
    setError(null);
    try {
      // Igual que el cliente tRPC: la cookie viaja siempre, y si la pestaña
      // entró por un link de solo lectura, el token va aparte.
      const acceso = cabeceraAcceso();
      const respuesta = await fetch(`${API}/api/informes/mensual?periodo=${periodo}`, {
        credentials: "include",
        headers: acceso ? { "x-acceso-consolidado": acceso } : {},
      });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? "No se pudo generar el informe.");
      }
      const url = URL.createObjectURL(await respuesta.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `informe-${periodo}.pdf`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Selector
          aria-label="Mes del informe"
          className="w-44"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatearPeriodo(`${m}-01`)}
            </option>
          ))}
        </Selector>
        <Boton tamano="sm" onClick={descargar} cargando={cargando}>
          <FileDown className="size-4" aria-hidden="true" />
          Descargar informe
        </Boton>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
