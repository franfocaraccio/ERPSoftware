import { Esqueleto, Tarjeta } from "@erp/design-system";
import { CircleCheck, CircleSlash, Info, TriangleAlert } from "lucide-react";
import { formatearImporte, formatearPorcentaje } from "../lib/formato.js";

export type Semaforo = "ok" | "alerta" | "sin_datos";

/**
 * El resumen de una cartera de cuenta corriente, sirva para cobrar o para
 * pagar. Las dos pantallas miden lo mismo —cuánto hay en juego y cuánto de eso
 * depende de una sola contraparte— aunque el riesgo que describen sea distinto:
 * en clientes es que no te paguen, en proveedores es depender de uno solo.
 */
export interface ResumenCartera {
  total: string;
  contrapartes: number;
  concentracion: { clave: string; porcentaje: string } | null;
  umbralConcentracion: string;
  semaforo: Semaforo;
  hayMonedaExtranjera: boolean;
}

export interface TextosCartera {
  /** "Total a cobrar" / "Total a pagar". */
  total: string;
  /** Qué dice abajo del número cuando hay contrapartes. */
  detalle: (cuantas: number) => string;
  /** Qué dice cuando no hay ninguna. */
  vacio: string;
}

/**
 * El estado nunca se transmite solo por color: cada semáforo lleva su ícono y
 * su texto, para que también funcione en blanco y negro o con daltonismo.
 */
const ESTADO = {
  ok: { Icono: CircleCheck, etiqueta: "En rango", clase: "text-success" },
  alerta: { Icono: TriangleAlert, etiqueta: "Atención", clase: "text-danger" },
  sin_datos: { Icono: CircleSlash, etiqueta: "Sin datos", clase: "text-muted-foreground" },
} as const;

export function TarjetasCartera({
  resumen,
  textos,
}: {
  resumen: ResumenCartera;
  textos: TextosCartera;
}) {
  const { Icono, etiqueta, clase } = ESTADO[resumen.semaforo];
  const concentracion = resumen.concentracion;

  return (
    <div className="mb-4 space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {textos.total}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground tabular">
            {formatearImporte(resumen.total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {resumen.contrapartes === 0 ? textos.vacio : textos.detalle(resumen.contrapartes)}
          </p>
        </Tarjeta>

        <Tarjeta className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mayor concentración
            </p>
            <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${clase}`}>
              <Icono className="size-3.5" aria-hidden="true" />
              {etiqueta}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground tabular">
            {concentracion ? formatearPorcentaje(concentracion.porcentaje) : "—"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {concentracion
              ? `${concentracion.clave} · umbral ${formatearPorcentaje(resumen.umbralConcentracion)}`
              : "Sin saldos para medir"}
          </p>
        </Tarjeta>
      </div>

      {resumen.hayMonedaExtranjera && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Hay comprobantes en moneda extranjera. Los importes de arriba son solo en pesos: mezclar
          monedas en un total daría un número que no existe.
        </p>
      )}
    </div>
  );
}

export function EsqueletoCartera() {
  return (
    <div
      className="mb-4 grid gap-3 sm:grid-cols-2"
      role="status"
      aria-busy="true"
      aria-label="Cargando resumen"
    >
      <Esqueleto className="h-[104px] w-full" />
      <Esqueleto className="h-[104px] w-full" />
    </div>
  );
}
