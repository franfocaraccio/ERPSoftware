import { Esqueleto, Tarjeta } from "@erp/design-system";
import { CircleCheck, CircleSlash, TriangleAlert } from "lucide-react";
import { formatearCantidad, formatearImporte } from "../../lib/formato.js";

export type Semaforo = "ok" | "alerta" | "sin_datos";

export interface Kpi {
  id: string;
  etiqueta: string;
  valor: string | null;
  unidad: "moneda" | "dias" | "porcentaje" | "ratio" | "conteo";
  semaforo: Semaforo;
  detalle: string;
  /** Los números con los que se calcula. */
  desglose: {
    etiqueta: string;
    valor: string;
    unidad: "moneda" | "dias" | "cantidad" | "conteo";
  }[];
  /** Por qué no hay valor. */
  motivoSinDatos: string | null;
}

function formatearComponente(c: Kpi["desglose"][number]): string {
  switch (c.unidad) {
    case "moneda":
      return formatearImporte(c.valor);
    case "dias":
      return `${c.valor} días`;
    case "cantidad":
      return formatearCantidad(c.valor);
    default:
      return c.valor;
  }
}

/**
 * El estado nunca se transmite solo por color: cada semáforo lleva su ícono y
 * su texto, para que también funcione en blanco y negro o con daltonismo.
 */
const ESTADO = {
  ok: { Icono: CircleCheck, etiqueta: "En rango", clase: "text-success" },
  alerta: { Icono: TriangleAlert, etiqueta: "Atención", clase: "text-danger" },
  sin_datos: { Icono: CircleSlash, etiqueta: "Sin datos", clase: "text-muted-foreground" },
  sin_umbral: { Icono: CircleSlash, etiqueta: "Sin umbral", clase: "text-muted-foreground" },
} as const;

/**
 * No es lo mismo no poder calcular el indicador que no tener contra qué
 * compararlo: si hay valor pero falta el umbral, decirlo "sin datos" al lado
 * de un número contradice lo que el usuario está viendo.
 */
function estadoVisible(kpi: Kpi): keyof typeof ESTADO {
  if (kpi.semaforo !== "sin_datos") {
    return kpi.semaforo;
  }
  return kpi.valor === null ? "sin_datos" : "sin_umbral";
}

function formatearValor(kpi: Kpi): string {
  if (kpi.valor === null) {
    return "—";
  }
  switch (kpi.unidad) {
    case "moneda":
      return formatearImporte(kpi.valor);
    case "dias": {
      const n = Number(kpi.valor);
      return `${n} ${Math.abs(n) === 1 ? "día" : "días"}`;
    }
    case "porcentaje":
      return `${kpi.valor.replace(".", ",")} %`;
    default:
      return kpi.valor.replace(".", ",");
  }
}

export function TarjetaKpi({ kpi }: { kpi: Kpi }) {
  const { Icono, etiqueta, clase } = ESTADO[estadoVisible(kpi)];
  return (
    <Tarjeta className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {kpi.etiqueta}
        </p>
        <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${clase}`}>
          <Icono className="size-3.5" aria-hidden="true" />
          {etiqueta}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{formatearValor(kpi)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{kpi.detalle}</p>
      {/* "Sin datos" dice qué falta: un guion solo no le sirve a nadie. */}
      {kpi.motivoSinDatos && (
        <p className="mt-1 text-xs text-muted-foreground italic">{kpi.motivoSinDatos}</p>
      )}
      {kpi.desglose.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Cómo se calcula
          </summary>
          <dl className="mt-1.5 space-y-0.5">
            {kpi.desglose.map((c) => (
              <div key={c.etiqueta} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{c.etiqueta}</dt>
                <dd className="tabular text-foreground">{formatearComponente(c)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Tarjeta>
  );
}

export function EsqueletoKpis() {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-busy="true"
      aria-label="Cargando indicadores"
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Esqueleto key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}
