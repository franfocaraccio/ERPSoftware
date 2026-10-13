import { InsigniaCobro } from "../../components/cuenta-corriente.js";
import { CeldaVencimiento } from "../../components/vencimiento.js";
import { formatearImporte } from "../../lib/formato.js";

interface Cobranza {
  vencimiento: string;
  pendiente: string;
  estado: "pendiente" | "parcial" | "cobrada" | "vencida";
}

/**
 * Cómo está de cobrado (o pagado) un comprobante, en una celda: el estado y,
 * si falta algo, cuánto y para cuándo. Un borrador, un rechazado o una nota de
 * crédito no son deuda y muestran una raya.
 */
export function CeldaCobranza({
  cobranza,
  lado,
  moneda,
}: {
  cobranza: Cobranza | null;
  lado: "ventas" | "compras";
  moneda: "ARS" | "USD";
}) {
  if (!cobranza) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5">
      <InsigniaCobro estado={cobranza.estado} lado={lado} />
      {cobranza.estado !== "cobrada" && (
        <div className="text-xs">
          {cobranza.estado === "parcial" && (
            <span className="tabular text-muted-foreground">
              Resta {formatearImporte(cobranza.pendiente, moneda)} ·{" "}
            </span>
          )}
          <CeldaVencimiento fecha={cobranza.vencimiento} />
        </div>
      )}
    </div>
  );
}
