import { useQuery } from "@tanstack/react-query";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Dólar oficial con sus dos puntas, al costado del título del panel.
 *
 * La fecha va siempre a la vista porque el oficial se mueve una vez por día
 * hábil: un lunes a la mañana el dato es del viernes, y eso tiene que notarse.
 *
 * Se formatea con `formatearFecha`, que corta el string y no construye un
 * `Date`. Construirlo adelanta el día: "2026-10-09" se interpreta como
 * medianoche UTC y, mostrado en hora argentina, cae en el 8.
 *
 * Cuando no hay cotización el recuadro se muestra igual, con guiones. Antes
 * desaparecía, y eso hizo que un backend sin deployar se viera exactamente
 * igual que la fuente caída: la pantalla no mostraba nada en los dos casos.
 *
 * Mientras carga no se muestra nada, para no hacer parpadear el encabezado.
 */
export function DolarOficial() {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery({
    ...trpc.cotizaciones.dolar.queryOptions(),
    // El oficial se mueve una vez por día hábil y el backend ya cachea una
    // hora. Esto evita además que cada vuelta al panel dispare una request.
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isPending) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Dólar oficial</p>
        <p className="text-[11px] text-muted-foreground">
          {data ? formatearFecha(data.fecha) : isError ? "Sin conexión" : "Sin datos"}
        </p>
      </div>
      <div className="mt-0.5 flex items-baseline gap-3">
        <span className="flex items-baseline gap-1">
          <span className="text-[11px] text-muted-foreground">Compra</span>
          <span className="tabular text-sm font-semibold text-foreground">
            {data ? formatearImporte(data.compra) : "—"}
          </span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-[11px] text-muted-foreground">Venta</span>
          <span className="tabular text-sm font-semibold text-foreground">
            {data ? formatearImporte(data.venta) : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
