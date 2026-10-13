import { imputarFIFO } from "@erp/core/balances";
import { Money } from "@erp/core/money";
import { Boton, Entrada, Esqueleto } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { CeldaVencimiento } from "../../components/vencimiento.js";
import { formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/** Importe por comprobante, como lo tipea la persona. Vacío = no se imputa. */
export type Imputaciones = Record<string, string>;

const IMPORTE_VALIDO = /^\d+(\.\d{1,2})?$/;

const ars = (v: string) =>
  IMPORTE_VALIDO.test(v.trim()) ? Money.desdeString(v.trim(), "ARS") : Money.cero("ARS");

/** Las líneas que viajan al backend: sólo las que tienen un importe. */
export function lineasDeImputacion(valores: Imputaciones) {
  return Object.entries(valores)
    .filter(([, importe]) => IMPORTE_VALIDO.test(importe.trim()) && ars(importe).esPositivo())
    .map(([comprobanteId, importe]) => ({ comprobanteId, importe: importe.trim() }));
}

/**
 * Qué comprobantes cancela un cobro o un pago, y por cuánto.
 *
 * Lo que no se imputa queda a cuenta de la contraparte: está permitido, y el
 * sistema lo aplica a sus comprobantes más viejos al calcular saldos. Las
 * reglas (no imputar de más) las vuelve a validar el backend.
 */
export function PanelImputacion({
  lado,
  contraparteId,
  importe,
  valores,
  onCambio,
}: {
  lado: "ventas" | "compras";
  contraparteId: string;
  /** El importe del movimiento, tal como está tipeado. */
  importe: string;
  valores: Imputaciones;
  onCambio: (valores: Imputaciones) => void;
}) {
  const trpc = useTRPC();
  const abiertos = useQuery(
    trpc.cuentaCorriente.abiertos.queryOptions({ lado, contraparteId, movimientoId: null }),
  );

  const total = ars(importe);
  const imputado = Money.sumarTodos(
    lineasDeImputacion(valores).map((l) => ars(l.importe)),
    "ARS",
  );
  const aCuenta = total.restar(imputado);
  const deMas = aCuenta.esNegativo();

  /** Reparte el importe del movimiento empezando por lo que vence antes. */
  function repartir() {
    const comprobantes = abiertos.data ?? [];
    const deudas = comprobantes.map((c) => ({
      id: c.id,
      vencimiento: c.vencimiento,
      importe: Money.desdeString(c.pendiente, "ARS"),
    }));
    // imputarFIFO devuelve lo que queda de cada uno; lo asignado es la resta.
    const quedan = new Map(imputarFIFO(deudas, total).pendientes.map((p) => [p.id, p.pendiente]));
    const nuevos: Imputaciones = {};
    for (const d of deudas) {
      const asignado = d.importe.restar(quedan.get(d.id) ?? Money.cero("ARS"));
      if (asignado.esPositivo()) {
        nuevos[d.id] = asignado.aStringFiscal();
      }
    }
    onCambio(nuevos);
  }

  const titulo = lado === "ventas" ? "Facturas que cancela" : "Compras que cancela";

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      {/* El legend tiene que ser el primer hijo del fieldset: si no, el
          navegador no lo toma como el nombre del grupo. */}
      <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Lo que no se imputa queda a cuenta.</p>
        <Boton
          variante="secundario"
          tamano="sm"
          onClick={repartir}
          disabled={!total.esPositivo() || !abiertos.data?.length}
        >
          Repartir automáticamente
        </Boton>
      </div>

      {abiertos.isPending ? (
        <Esqueleto className="h-16 w-full" />
      ) : !abiertos.data?.length ? (
        <p className="text-sm text-muted-foreground">
          No tiene comprobantes pendientes. El importe queda a cuenta.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Comprobante</th>
                <th className="px-2 py-1.5 text-left font-medium">Vence</th>
                <th className="px-2 py-1.5 text-right font-medium">Pendiente</th>
                <th className="px-2 py-1.5 text-right font-medium">Imputar</th>
              </tr>
            </thead>
            <tbody>
              {abiertos.data.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 tabular">{c.descripcion}</td>
                  <td className="px-2 py-1.5">
                    <CeldaVencimiento fecha={c.vencimiento} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">
                    {formatearImporte(c.pendiente)}
                  </td>
                  <td className="w-36 px-2 py-1">
                    <Entrada
                      aria-label={`Importe a imputar a ${c.descripcion}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-9 text-right tabular"
                      value={valores[c.id] ?? ""}
                      onChange={(e) => onCambio({ ...valores, [c.id]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={`text-sm ${deMas ? "font-medium text-danger" : "text-muted-foreground"}`}>
        Imputado <span className="tabular">{formatearImporte(imputado.aStringFiscal())}</span>
        {" · "}
        {deMas ? (
          <>Se imputa más de lo que dice el movimiento.</>
        ) : (
          <>
            A cuenta <span className="tabular">{formatearImporte(aCuenta.aStringFiscal())}</span>
          </>
        )}
      </p>
    </fieldset>
  );
}
