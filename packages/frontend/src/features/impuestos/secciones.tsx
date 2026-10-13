import { hoyEnArgentina } from "@erp/core/dates";
import {
  Boton,
  Campo,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { useModoLectura } from "../../components/sesion.js";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearFecha, formatearImporte, formatearPeriodo } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * De dónde sale el IVA que calcula el sistema: débito de ventas, crédito de
 * compras y el saldo a favor que se arrastra, mes a mes.
 */
export function PosicionIva() {
  const trpc = useTRPC();
  const parametros = useQuery(trpc.parametros.obtener.queryOptions());
  const { data, isPending } = useQuery(trpc.impuestos.posicionIva.queryOptions());

  if (parametros.data?.regimenFiscal === "monotributo") {
    return null;
  }
  // Los últimos doce meses alcanzan para entender la posición actual.
  const meses = [...(data ?? [])].reverse().slice(0, 12);

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground">Posición de IVA</h2>
        <p className="text-xs text-muted-foreground">
          Calculada con los comprobantes enviados y aprobados en pesos. El IVA a pagar de cada mes
          aparece arriba como obligación.
        </p>
      </div>
      {isPending ? (
        <Esqueleto className="m-4 h-24" />
      ) : meses.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Todavía no hay comprobantes con IVA.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Período</th>
                <th className="px-4 py-2 text-right font-medium">Débito fiscal</th>
                <th className="px-4 py-2 text-right font-medium">Crédito fiscal</th>
                <th className="px-4 py-2 text-right font-medium">Saldo a favor anterior</th>
                <th className="px-4 py-2 text-right font-medium">A pagar</th>
                <th className="px-4 py-2 text-right font-medium">Saldo a favor</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.periodo} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular">{formatearPeriodo(`${m.periodo}-01`)}</td>
                  <td className="px-4 py-2 text-right tabular">{formatearImporte(m.debito)}</td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(m.credito)}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(m.saldoAFavorAnterior)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular">
                    {formatearImporte(m.aPagar)}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(m.saldoAFavorSiguiente)}
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

const ETIQUETA_RETENCION = {
  retencion: "Retención",
  percepcion: "Percepción",
  sircreb: "SIRCREB",
} as const;

const IMPORTE = /^\d+(\.\d{1,2})?$/;

/**
 * Retenciones, percepciones y SIRCREB de IIBB sufridas: pagos a cuenta que
 * restan del IIBB del período.
 */
export function RetencionesIibb() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const soloLectura = useModoLectura();
  const { data, isPending } = useQuery(trpc.impuestos.retenciones.listar.queryOptions());
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyEnArgentina();
  const [valores, setValores] = useState({
    fecha: hoy,
    periodo: hoy.slice(0, 7),
    tipo: "retencion" as keyof typeof ETIQUETA_RETENCION,
    agente: "",
    comprobante: "",
    importe: "",
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: trpc.impuestos.pathKey() });
  const crear = useMutation({
    ...trpc.impuestos.retenciones.crear.mutationOptions(),
    onSuccess: async () => {
      await refrescar();
      setAbierto(false);
      setValores((v) => ({ ...v, agente: "", comprobante: "", importe: "" }));
    },
  });
  const eliminar = useMutation({
    ...trpc.impuestos.retenciones.eliminar.mutationOptions(),
    onSuccess: refrescar,
  });

  const importeValido = IMPORTE.test(valores.importe.trim()) && valores.importe.trim() !== "0";

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Retenciones y percepciones de IIBB
          </h2>
          <p className="text-xs text-muted-foreground">
            Incluye SIRCREB. Se descuentan solas del IIBB del período al que se imputan.
          </p>
        </div>
        {!soloLectura && !abierto && (
          <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Cargar
          </Boton>
        )}
      </div>

      {abierto && (
        <form
          className="mx-4 mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!importeValido) {
              return;
            }
            crear.mutate({
              fecha: valores.fecha,
              periodo: valores.periodo,
              tipo: valores.tipo,
              importe: valores.importe.trim(),
              ...(valores.agente.trim() ? { agente: valores.agente.trim() } : {}),
              ...(valores.comprobante.trim() ? { comprobante: valores.comprobante.trim() } : {}),
            });
          }}
        >
          <Campo etiqueta="Tipo">
            {({ id }) => (
              <Selector
                id={id}
                value={valores.tipo}
                onChange={(e) =>
                  setValores({ ...valores, tipo: e.target.value as typeof valores.tipo })
                }
              >
                {Object.entries(ETIQUETA_RETENCION).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
          <Campo etiqueta="Fecha">
            {({ id }) => (
              <Entrada
                id={id}
                type="date"
                className="tabular"
                value={valores.fecha}
                onChange={(e) => setValores({ ...valores, fecha: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Período de IIBB" ayuda="Del que se descuenta">
            {({ id }) => (
              <Entrada
                id={id}
                type="month"
                className="tabular"
                value={valores.periodo}
                onChange={(e) => setValores({ ...valores, periodo: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Agente" ayuda="Quién retuvo o percibió">
            {({ id }) => (
              <Entrada
                id={id}
                value={valores.agente}
                onChange={(e) => setValores({ ...valores, agente: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Comprobante">
            {({ id }) => (
              <Entrada
                id={id}
                value={valores.comprobante}
                onChange={(e) => setValores({ ...valores, comprobante: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Importe" requerido>
            {({ id }) => (
              <Entrada
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                className="tabular"
                value={valores.importe}
                onChange={(e) => setValores({ ...valores, importe: e.target.value })}
              />
            )}
          </Campo>
          {crear.isError && (
            <p role="alert" className="text-sm text-danger sm:col-span-3">
              No se pudo guardar: {mensajeDeError(crear.error)}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" tamano="sm" disabled={!importeValido} cargando={crear.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      )}

      {isPending ? (
        <Esqueleto className="m-4 h-16" />
      ) : !data?.length ? (
        <EstadoVacio
          icono={<Receipt className="size-8" aria-hidden="true" />}
          titulo="Sin retenciones cargadas"
          descripcion="Cargá las retenciones, percepciones y SIRCREB para que se descuenten del IIBB."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Período</th>
                <th className="px-4 py-2 text-left font-medium">Tipo</th>
                <th className="px-4 py-2 text-left font-medium">Fecha</th>
                <th className="px-4 py-2 text-left font-medium">Agente</th>
                <th className="px-4 py-2 text-right font-medium">Importe</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular">{formatearPeriodo(r.periodo)}</td>
                  <td className="px-4 py-2">{ETIQUETA_RETENCION[r.tipo]}</td>
                  <td className="px-4 py-2 tabular text-muted-foreground">
                    {formatearFecha(r.fecha)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.agente ?? "—"}
                    {r.comprobante ? ` · ${r.comprobante}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular">
                    {formatearImporte(r.importe)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!soloLectura && (
                      <Boton
                        variante="fantasma"
                        tamano="icono"
                        aria-label={`Borrar ${ETIQUETA_RETENCION[r.tipo]} de ${formatearImporte(r.importe)}`}
                        cargando={eliminar.isPending && eliminar.variables?.id === r.id}
                        onClick={() => eliminar.mutate({ id: r.id })}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Boton>
                    )}
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
