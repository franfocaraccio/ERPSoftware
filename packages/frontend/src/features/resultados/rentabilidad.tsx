import { hoyEnArgentina } from "@erp/core/dates";
import { cn, Esqueleto, EstadoVacio, Selector, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { PieChart } from "lucide-react";
import { useState } from "react";
import { formatearImporte, formatearPorcentaje } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

const AGRUPAR = {
  cliente: "Cliente",
  producto: "Producto",
  categoria: "Categoría de producto",
} as const;

const PERIODOS = {
  mes: "Este mes",
  "3m": "Últimos 3 meses",
  "12m": "Últimos 12 meses",
} as const;

function desdeDe(periodo: keyof typeof PERIODOS, hoy: string): string {
  if (periodo === "mes") {
    return `${hoy.slice(0, 7)}-01`;
  }
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (periodo === "3m" ? 3 : 12));
  return d.toISOString().slice(0, 10);
}

/**
 * Dónde se gana y dónde se pierde: margen por cliente, por producto o por
 * categoría. Lo que más deja arriba, las fugas abajo.
 */
export function Rentabilidad() {
  const trpc = useTRPC();
  const [agrupar, setAgrupar] = useState<keyof typeof AGRUPAR>("cliente");
  const [periodo, setPeriodo] = useState<keyof typeof PERIODOS>("3m");
  const hoy = hoyEnArgentina();
  const { data, isPending } = useQuery(
    trpc.resultados.rentabilidad.queryOptions({
      agrupar,
      desde: desdeDe(periodo, hoy),
      hasta: hoy,
    }),
  );

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rentabilidad</h2>
          <p className="text-xs text-muted-foreground">
            Ventas netas menos el costo de lo vendido, por {AGRUPAR[agrupar].toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Selector
            aria-label="Agrupar por"
            className="w-52"
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as keyof typeof AGRUPAR)}
          >
            {Object.entries(AGRUPAR).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                Por {etiqueta.toLowerCase()}
              </option>
            ))}
          </Selector>
          <Selector
            aria-label="Período"
            className="w-44"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as keyof typeof PERIODOS)}
          >
            {Object.entries(PERIODOS).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
        </div>
      </div>

      {isPending ? (
        <Esqueleto className="m-4 h-40" />
      ) : !data?.length ? (
        <EstadoVacio
          icono={<PieChart className="size-8" aria-hidden="true" />}
          titulo="Sin ventas en el período"
          descripcion="Elegí un período más largo."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">{AGRUPAR[agrupar]}</th>
                <th className="px-4 py-2 text-right font-medium">Ventas netas</th>
                <th className="px-4 py-2 text-right font-medium">Costo</th>
                <th className="px-4 py-2 text-right font-medium">Margen</th>
                <th className="px-4 py-2 text-right font-medium">Margen %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.clave} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    {f.clave}
                    {f.incluyeTextoLibre && (
                      <span
                        className="ml-1 text-xs text-warning"
                        title="Tiene ítems sin producto: su costo no se conoce y el margen sale más alto"
                      >
                        · costo incompleto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular">{formatearImporte(f.ventas)}</td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(f.costo)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium tabular",
                      f.margen.startsWith("-") && "text-danger",
                    )}
                  >
                    {formatearImporte(f.margen)}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {f.margenPorcentual === null ? "—" : formatearPorcentaje(f.margenPorcentual)}
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
