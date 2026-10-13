import { cn, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { formatearFecha, formatearImporte } from "../lib/formato.js";
import { CeldaVencimiento } from "./vencimiento.js";

/**
 * Piezas de la ficha de cliente y de proveedor. Las dos muestran la misma
 * cuenta corriente desde lados opuestos: lo que nos deben y lo que debemos.
 */

type EstadoCobro = "pendiente" | "parcial" | "cobrada" | "vencida";

const TONO_COBRO = {
  pendiente: "neutro",
  parcial: "info",
  cobrada: "exito",
  vencida: "peligro",
} as const;

/** "Cobrada" para ventas, "Pagada" para compras: el mismo estado visto de cada lado. */
export function etiquetaCobro(estado: EstadoCobro, lado: "ventas" | "compras"): string {
  const etiquetas = {
    pendiente: "Pendiente",
    parcial: "Parcial",
    cobrada: lado === "ventas" ? "Cobrada" : "Pagada",
    vencida: "Vencida",
  };
  return etiquetas[estado];
}

export function InsigniaCobro({
  estado,
  lado,
}: {
  estado: EstadoCobro;
  lado: "ventas" | "compras";
}) {
  return <Insignia tono={TONO_COBRO[estado]}>{etiquetaCobro(estado, lado)}</Insignia>;
}

export function Dato({
  etiqueta,
  children,
  alerta = false,
}: {
  etiqueta: string;
  children: ReactNode;
  alerta?: boolean;
}) {
  return (
    <Tarjeta className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </p>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular",
          alerta ? "text-danger" : "text-foreground",
        )}
      >
        {children}
      </div>
    </Tarjeta>
  );
}

const TRAMOS = [
  { clave: "aVencer", etiqueta: "A vencer" },
  { clave: "hasta30", etiqueta: "1 a 30 días" },
  { clave: "de31a60", etiqueta: "31 a 60 días" },
  { clave: "de61a90", etiqueta: "61 a 90 días" },
  { clave: "masDe90", etiqueta: "Más de 90" },
] as const;

/** La deuda pendiente por días de atraso. */
export function Antiguedad({
  antiguedad,
}: {
  antiguedad: Record<(typeof TRAMOS)[number]["clave"], string>;
}) {
  return (
    <Tarjeta className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Antigüedad de la deuda</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TRAMOS.map(({ clave, etiqueta }, i) => {
          const valor = antiguedad[clave];
          const hay = valor !== "0.00";
          return (
            <div key={clave}>
              <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
              <dd
                className={cn(
                  "text-sm font-medium tabular",
                  // Más rojo cuanto más viejo: es lo primero que hay que mirar.
                  hay && i >= 3 ? "text-danger" : hay ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {formatearImporte(valor)}
              </dd>
            </div>
          );
        })}
      </dl>
    </Tarjeta>
  );
}

export function TablaAbiertos({
  abiertos,
  lado,
}: {
  abiertos: {
    id: string;
    descripcion: string;
    fecha: string;
    vencimiento: string;
    total: string;
    pendiente: string;
    estado: EstadoCobro;
  }[];
  lado: "ventas" | "compras";
}) {
  return (
    <Tarjeta className="overflow-hidden">
      <h2 className="px-4 pt-4 text-sm font-semibold text-foreground">
        {lado === "ventas" ? "Facturas pendientes de cobro" : "Compras pendientes de pago"}
      </h2>
      {abiertos.length === 0 ? (
        <EstadoVacio
          icono={<CheckCircle2 className="size-8" aria-hidden="true" />}
          titulo="Está al día"
          descripcion="No tiene comprobantes pendientes."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Comprobante</th>
                <th className="px-4 py-2 text-left font-medium">Fecha</th>
                <th className="px-4 py-2 text-left font-medium">Vence</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Pendiente</th>
                <th className="px-4 py-2 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {abiertos.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular">{c.descripcion}</td>
                  <td className="px-4 py-2 tabular text-muted-foreground">
                    {formatearFecha(c.fecha)}
                  </td>
                  <td className="px-4 py-2">
                    <CeldaVencimiento fecha={c.vencimiento} />
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(c.total)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular text-foreground">
                    {formatearImporte(c.pendiente)}
                  </td>
                  <td className="px-4 py-2">
                    <InsigniaCobro estado={c.estado} lado={lado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export function TablaMovimientos({
  movimientos,
}: {
  movimientos: {
    id: string;
    fecha: string;
    tipo: "ingreso" | "egreso";
    concepto: string | null;
    importe: string;
    cuenta: string;
    moneda: "ARS" | "USD";
  }[];
}) {
  if (movimientos.length === 0) {
    return null;
  }
  return (
    <Tarjeta className="overflow-hidden">
      <h2 className="px-4 pt-4 text-sm font-semibold text-foreground">Últimos movimientos</h2>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-sm">
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 tabular text-muted-foreground">
                  {formatearFecha(m.fecha)}
                </td>
                <td className="px-4 py-2">
                  {m.concepto ?? (m.tipo === "ingreso" ? "Cobro" : "Pago")}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{m.cuenta}</td>
                <td
                  className={cn(
                    "px-4 py-2 text-right font-medium tabular",
                    m.tipo === "ingreso" ? "text-success" : "text-foreground",
                  )}
                >
                  {m.tipo === "egreso" ? "−" : ""}
                  {formatearImporte(m.importe, m.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
