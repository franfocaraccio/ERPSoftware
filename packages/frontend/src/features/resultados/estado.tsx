import { hoyEnArgentina } from "@erp/core/dates";
import { cn, Esqueleto, Insignia, Selector, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatearImporte, formatearPeriodo, formatearPorcentaje } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

const negativo = (v: string) => v.startsWith("-");

/** Una fila del cuadro: un concepto con su importe en cada mes. */
function Fila({
  concepto,
  valores,
  nivel = "normal",
  resta = false,
}: {
  concepto: string;
  valores: string[];
  nivel?: "normal" | "subtotal" | "total" | "detalle";
  resta?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border/60",
        nivel === "subtotal" && "bg-surface-muted/50 font-medium",
        nivel === "total" && "bg-surface-muted font-semibold",
      )}
    >
      <th
        scope="row"
        className={cn(
          "sticky left-0 bg-surface px-3 py-2 text-left font-normal whitespace-nowrap",
          nivel === "detalle" && "pl-7 text-muted-foreground",
          (nivel === "subtotal" || nivel === "total") && "bg-surface-muted font-medium",
        )}
      >
        {resta ? "− " : ""}
        {concepto}
      </th>
      {valores.map((v, i) => (
        <td
          // biome-ignore lint/suspicious/noArrayIndexKey: la columna es el mes
          key={i}
          className={cn(
            "px-3 py-2 text-right tabular whitespace-nowrap",
            nivel === "detalle" && "text-muted-foreground",
            (nivel === "subtotal" || nivel === "total") && negativo(v) && "text-danger",
          )}
        >
          {v === "0.00" && nivel === "detalle" ? "—" : formatearImporte(v)}
        </td>
      ))}
    </tr>
  );
}

/**
 * El estado de resultados mes a mes, en cascada: ventas, costo, margen,
 * gastos por categoría, impuestos sobre ventas y resultado.
 */
export function EstadoResultados() {
  const trpc = useTRPC();
  const [meses, setMeses] = useState(6);
  const { data, isPending } = useQuery(trpc.resultados.estado.queryOptions({ meses }));

  // Las categorías que aparecen en algún mes, en el orden en que pesan más.
  const categorias = [...new Set((data ?? []).flatMap((m) => m.gastos.map((g) => g.categoria)))];
  const gastoDe = (categoria: string) =>
    (data ?? []).map((m) => m.gastos.find((g) => g.categoria === categoria)?.importe ?? "0.00");
  const col = <K extends keyof NonNullable<typeof data>[number]>(k: K) =>
    (data ?? []).map((m) => String(m[k] ?? "0.00"));

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Estado de resultados</h2>
          <p className="text-xs text-muted-foreground">
            Devengado: ventas y compras por la fecha del comprobante, en neto (sin IVA). Antes del
            impuesto a las ganancias.
          </p>
        </div>
        <Selector
          aria-label="Meses a mostrar"
          className="w-40"
          value={String(meses)}
          onChange={(e) => setMeses(Number(e.target.value))}
        >
          <option value="3">Últimos 3 meses</option>
          <option value="6">Últimos 6 meses</option>
          <option value="12">Últimos 12 meses</option>
        </Selector>
      </div>

      {isPending ? (
        <Esqueleto className="m-4 h-64" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                  <span className="sr-only">Concepto</span>
                </th>
                {(data ?? []).map((m) => (
                  <th
                    key={m.periodo}
                    className="px-3 py-2 text-right font-medium whitespace-nowrap"
                  >
                    {formatearPeriodo(`${m.periodo}-01`)}
                    {m.periodo === hoyEnArgentina().slice(0, 7) && (
                      <Insignia tono="info" className="ml-1">
                        en curso
                      </Insignia>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Fila concepto="Ventas netas" valores={col("ventas")} />
              <Fila concepto="Costo de ventas" valores={col("costoVentas")} resta />
              <Fila concepto="Margen bruto" valores={col("margenBruto")} nivel="subtotal" />
              <tr className="border-b border-border/60">
                <th
                  scope="row"
                  className="sticky left-0 bg-surface px-3 py-1.5 pl-7 text-left text-xs font-normal text-muted-foreground"
                >
                  Margen sobre ventas
                </th>
                {(data ?? []).map((m) => (
                  <td
                    key={m.periodo}
                    className="px-3 py-1.5 text-right text-xs tabular text-muted-foreground"
                  >
                    {m.margenPorcentual === null ? "—" : formatearPorcentaje(m.margenPorcentual)}
                  </td>
                ))}
              </tr>
              {categorias.map((c) => (
                <Fila key={c} concepto={c} valores={gastoDe(c)} nivel="detalle" resta />
              ))}
              <Fila concepto="Gastos" valores={col("totalGastos")} resta />
              <Fila
                concepto="Impuestos sobre ventas (IIBB)"
                valores={col("impuestosSobreVentas")}
                resta
              />
              <Fila
                concepto="Resultado operativo"
                valores={col("resultadoOperativo")}
                nivel="subtotal"
              />
              <Fila concepto="Otros ingresos" valores={col("otrosIngresos")} />
              <Fila concepto="Resultado neto" valores={col("resultadoNeto")} nivel="total" />
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
