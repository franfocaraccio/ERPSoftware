import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

type Tendencia = "sube" | "baja" | "igual";

interface Cotizacion {
  compra: string;
  venta: string;
  fecha: string;
  variacion: string;
  tendencia: Tendencia;
}

/**
 * El movimiento no se transmite solo por color: cada tendencia lleva su flecha
 * y su signo, así también se lee en blanco y negro o con daltonismo.
 *
 * Sube el dólar es malo para quien compra y bueno para quien vende, así que no
 * se usan los colores de "en rango" y "alerta" del panel: acá verde y rojo
 * significan subió y bajó, nada más.
 */
const TENDENCIA: Record<Tendencia, { Icono: typeof ArrowUp; clase: string }> = {
  sube: { Icono: ArrowUp, clase: "text-success" },
  baja: { Icono: ArrowDown, clase: "text-danger" },
  igual: { Icono: Minus, clase: "text-muted-foreground" },
};

/** "-0.14" → "-0,14 %". El signo queda a la vista junto a la flecha. */
function porcentaje(valor: string): string {
  return `${valor.replace(".", ",")} %`;
}

function Fila({ nombre, cotizacion }: { nombre: string; cotizacion: Cotizacion | null }) {
  if (!cotizacion) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-medium text-foreground">{nombre}</span>
        <span className="text-xs text-muted-foreground">Sin datos</span>
      </div>
    );
  }

  const { Icono, clase } = TENDENCIA[cotizacion.tendencia];
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs font-medium text-foreground">{nombre}</span>
      <span className="flex items-baseline gap-2.5">
        <span className="tabular text-sm text-foreground">
          {formatearImporte(cotizacion.compra)}
        </span>
        <span className="tabular text-sm font-semibold text-foreground">
          {formatearImporte(cotizacion.venta)}
        </span>
        <span className={`flex w-[4.5rem] items-center justify-end gap-0.5 text-xs ${clase}`}>
          <Icono className="size-3" aria-hidden="true" />
          <span className="tabular">{porcentaje(cotizacion.variacion)}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * Cotizaciones del dólar, al costado del título del panel.
 *
 * La fecha va a la vista porque el oficial se mueve una vez por día hábil: un
 * lunes a la mañana el dato es del viernes, y eso tiene que notarse. Se muestra
 * la del oficial, que es la que se queda quieta; el blue cotiza todo el día.
 *
 * Se formatea con `formatearFecha`, que corta el string y no construye un
 * `Date`. Construirlo adelanta el día: "2026-10-09" se interpreta como
 * medianoche UTC y, mostrado en hora argentina, cae en el 8.
 *
 * Cuando no hay cotización el recuadro se muestra igual. Antes desaparecía, y
 * eso hizo que un backend sin deployar se viera idéntico a la fuente caída.
 *
 * Mientras carga no se muestra nada, para no hacer parpadear el encabezado.
 */
export function DolarOficial() {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery({
    ...trpc.cotizaciones.dolar.queryOptions(),
    // El backend ya cachea media hora; esto evita además que cada vuelta al
    // panel dispare una request.
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isPending) {
    return null;
  }

  const oficial = (data?.oficial ?? null) as Cotizacion | null;
  const blue = (data?.blue ?? null) as Cotizacion | null;
  const fecha = oficial?.fecha ?? blue?.fecha ?? null;

  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Dólar</p>
        <p className="text-[11px] text-muted-foreground">
          {fecha ? formatearFecha(fecha) : isError ? "Sin conexión" : "Sin datos"}
        </p>
      </div>
      {/* Los encabezados nombran las columnas una sola vez, como en el diario. */}
      <div className="flex items-baseline justify-between gap-4 text-[10px] tracking-wide text-muted-foreground uppercase">
        <span />
        <span className="flex items-baseline gap-2.5">
          <span className="w-[5.5rem] text-right">Compra</span>
          <span className="w-[5.5rem] text-right">Venta</span>
          <span className="w-[4.5rem] text-right">Var.</span>
        </span>
      </div>
      <div className="mt-0.5 space-y-0.5">
        <Fila nombre="Oficial" cotizacion={oficial} />
        <Fila nombre="Blue" cotizacion={blue} />
      </div>
    </div>
  );
}
