import { useQuery } from "@tanstack/react-query";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Dólar oficial del BCRA, al costado del título del panel.
 *
 * La fecha va siempre a la vista porque el BCRA publica por día hábil: un lunes
 * a la mañana el dato es del viernes, y eso tiene que notarse.
 *
 * Cuando no hay cotización el recuadro se muestra igual, con un guion. Antes
 * desaparecía, y eso hizo que un backend sin deployar se viera exactamente
 * igual que el BCRA caído: la pantalla no mostraba nada en los dos casos y no
 * había forma de distinguirlos sin abrir la consola. Un hueco no comunica; un
 * guion dice "esto existe y hoy no tiene dato".
 *
 * Mientras carga no se muestra nada, para no hacer parpadear el encabezado.
 */
export function DolarOficial() {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery({
    ...trpc.cotizaciones.dolar.queryOptions(),
    // El BCRA publica una vez por día hábil; el backend ya cachea una hora.
    // Esto evita además que cada vuelta al panel dispare una request.
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isPending) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-right">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Dólar oficial</p>
      <p className="tabular text-sm font-semibold text-foreground">
        {data ? formatearImporte(data.valor) : "—"}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {data ? `BCRA · ${formatearFecha(data.fecha)}` : isError ? "Sin conexión" : "Sin datos"}
      </p>
    </div>
  );
}
