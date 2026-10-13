import { Boton, Tarjeta } from "@erp/design-system";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearFecha, formatearFechaHora, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

interface Alertas {
  primeraBajoMinimo: { semana: number; inicio: string; saldoFinal: string } | null;
  primeraNegativa: { semana: number; inicio: string; saldoFinal: string } | null;
}

/**
 * Lo que va a pasar si nada cambia: la semana en que la caja queda bajo el
 * mínimo o en negativo. Es aritmética de la proyección: no usa IA.
 */
export function AlertasCaja({ alertas }: { alertas: Alertas }) {
  const { primeraBajoMinimo, primeraNegativa } = alertas;
  if (!primeraBajoMinimo && !primeraNegativa) {
    return null;
  }
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        {primeraBajoMinimo && (
          <p>
            En la semana del {formatearFecha(primeraBajoMinimo.inicio)} el saldo proyectado queda
            bajo el mínimo operativo ({formatearImporte(primeraBajoMinimo.saldoFinal)}).
          </p>
        )}
        {primeraNegativa && (
          <p>
            En la semana del {formatearFecha(primeraNegativa.inicio)} la caja proyectada queda en
            negativo.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Un texto que explica el último mes cerrado contra el anterior. Lo redacta
 * un modelo de lenguaje a partir de números que calcula el sistema; los
 * hechos usados quedan a la vista para poder verificarlo.
 */
export function LecturaDelMes() {
  const trpc = useTRPC();
  const habilitada = useQuery(trpc.explicacion.habilitada.queryOptions());
  const generar = useMutation(trpc.explicacion.generar.mutationOptions());

  if (!habilitada.data) {
    return null;
  }

  return (
    <Tarjeta className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lectura del mes</h2>
          <p className="text-xs text-muted-foreground">
            El último mes cerrado contra el anterior, explicado en palabras.
          </p>
        </div>
        {!generar.data && (
          <Boton
            variante="secundario"
            tamano="sm"
            cargando={generar.isPending}
            onClick={() => generar.mutate()}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Explicar
          </Boton>
        )}
      </div>

      {generar.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {mensajeDeError(generar.error)}
        </p>
      )}

      {generar.data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-relaxed text-foreground">{generar.data.texto}</p>
          <p className="text-xs text-muted-foreground">
            Redactado por IA el {formatearFechaHora(generar.data.generada)} a partir de los números
            del sistema. Puede equivocarse al redactar: los números de abajo son los que manda.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Los números que usó
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {generar.data.hechos.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Tarjeta>
  );
}
