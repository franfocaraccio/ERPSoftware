import { Esqueleto, Tarjeta } from "@erp/design-system";
import { CircleCheck, CircleSlash, Info, TriangleAlert } from "lucide-react";
import { formatearImporte, formatearPorcentaje } from "../../lib/formato.js";

export type Semaforo = "ok" | "alerta" | "sin_datos";

export interface ResumenCartera {
  totalACobrar: string;
  deudores: number;
  concentracion: { clave: string; porcentaje: string } | null;
  umbralConcentracion: string;
  semaforo: Semaforo;
  hayMonedaExtranjera: boolean;
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

export function ResumenClientes({ resumen }: { resumen: ResumenCartera }) {
  const { Icono, etiqueta, clase } = ESTADO[resumen.semaforo];
  const concentracion = resumen.concentracion;

  return (
    <div className="mb-4 space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Total a cobrar
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground tabular">
            {formatearImporte(resumen.totalACobrar)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {resumen.deudores === 0
              ? "Ningún cliente con saldo pendiente"
              : `${resumen.deudores} ${resumen.deudores === 1 ? "cliente adeuda" : "clientes adeudan"} este total`}
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

export function EsqueletoResumen() {
  return (
    <div
      className="mb-4 grid gap-3 sm:grid-cols-2"
      role="status"
      aria-busy="true"
      aria-label="Cargando resumen de cartera"
    >
      <Esqueleto className="h-[104px] w-full" />
      <Esqueleto className="h-[104px] w-full" />
    </div>
  );
}
