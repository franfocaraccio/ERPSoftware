import { useQuery } from "@tanstack/react-query";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Dólar oficial del BCRA, al costado del título del panel.
 *
 * Es informativo y nada depende de él, así que mientras carga o si el BCRA no
 * contesta no se muestra nada: un hueco es mejor que un "—" que invite a
 * preguntarse si el sistema está roto.
 *
 * La fecha va siempre a la vista porque el BCRA publica por día hábil: un lunes
 * a la mañana el dato es del viernes, y eso tiene que notarse.
 */
export function DolarOficial() {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.cotizaciones.dolar.queryOptions(),
    // El BCRA publica una vez por día hábil; el backend ya cachea una hora.
    // Esto evita además que cada vuelta al panel dispare una request.
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-right">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Dólar oficial</p>
      <p className="tabular text-sm font-semibold text-foreground">
        {formatearImporte(data.valor)}
      </p>
      <p className="text-[11px] text-muted-foreground">BCRA · {formatearFecha(data.fecha)}</p>
    </div>
  );
}
