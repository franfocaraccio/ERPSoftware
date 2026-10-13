import { hoyEnArgentina } from "@erp/core/dates";
import { formatearFecha } from "../lib/formato.js";

/**
 * Celda de vencimiento de una deuda: en rojo si ya pasó.
 *
 * La fecha es la de la deuda impaga más vieja, así que puede estar en el
 * pasado, y ese es el caso que más importa ver.
 */
export function CeldaVencimiento({ fecha }: { fecha: string | null }) {
  if (!fecha) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (fecha < hoyEnArgentina()) {
    return (
      <span className="tabular font-medium text-danger">Vencido el {formatearFecha(fecha)}</span>
    );
  }
  return <span className="tabular text-muted-foreground">{formatearFecha(fecha)}</span>;
}
