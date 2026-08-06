import { Boton, clasesBoton, Esqueleto, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EncabezadoPagina } from "../../components/layout.js";
import { formatearCantidad, formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

type Estado = "borrador" | "enviada" | "aprobada" | "rechazada";
type Evento = "emitir" | "aprobar" | "rechazar" | "corregir";

const TONO_ESTADO = {
  borrador: "neutro",
  enviada: "info",
  aprobada: "exito",
  rechazada: "peligro",
} as const;

const ETIQUETA_ESTADO = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
} as const;

const ETIQUETA_EVENTO: Record<Evento, string> = {
  emitir: "Emitir",
  aprobar: "Aprobar",
  rechazar: "Rechazar",
  corregir: "Volver a borrador",
};

const ETIQUETA_ALICUOTA: Record<string, string> = {
  exento: "Exento",
  no_gravado: "No gravado",
};

function etiquetaAlicuota(valor: string): string {
  return ETIQUETA_ALICUOTA[valor] ?? `${valor.replace(".", ",")} %`;
}

export function DetalleComprobante({ comprobanteId }: { comprobanteId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery(
    trpc.comprobantes.ventas.obtener.queryOptions({ id: comprobanteId }),
  );

  const transicionar = useMutation({
    ...trpc.comprobantes.ventas.transicionar.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() }),
  });

  if (isError) {
    return (
      <Tarjeta>
        <EstadoVacio
          titulo="No se encontró el comprobante"
          accion={
            <Link to="/comprobantes" className={clasesBoton("secundario", "sm")}>
              Volver
            </Link>
          }
        />
      </Tarjeta>
    );
  }

  if (isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Comprobante" />
        <Tarjeta className="space-y-4 p-6">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-16 w-full" />
          ))}
        </Tarjeta>
      </>
    );
  }

  const estado = data.estado as Estado;
  const numeroFormateado = `${data.letra} ${String(data.puntoVenta).padStart(4, "0")}-${
    data.numero === null ? "—" : String(data.numero).padStart(8, "0")
  }`;

  return (
    <>
      <Link
        to="/comprobantes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a comprobantes
      </Link>

      <EncabezadoPagina
        titulo={numeroFormateado}
        descripcion={data.clienteRazonSocial}
        acciones={
          <div className="flex items-center gap-2">
            <Insignia tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Insignia>
            {(data.availableEvents as Evento[]).map((evento) => (
              <Boton
                key={evento}
                variante={evento === "rechazar" ? "peligro" : "secundario"}
                tamano="sm"
                cargando={transicionar.isPending}
                onClick={() => transicionar.mutate({ id: comprobanteId, evento })}
              >
                {ETIQUETA_EVENTO[evento]}
              </Boton>
            ))}
          </div>
        }
      />

      {transicionar.isError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {transicionar.error.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Tarjeta className="overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Ítems del comprobante</caption>
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Descripción
                </th>
                {["Cant.", "Precio unit.", "IVA", "Subtotal"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-foreground">{item.descripcion}</td>
                  <td className="px-4 py-3 text-right tabular text-muted-foreground">
                    {formatearCantidad(item.cantidad)}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-muted-foreground">
                    {formatearImporte(item.precioUnitario, data.moneda)}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-muted-foreground">
                    {etiquetaAlicuota(item.alicuotaIva)}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-foreground">
                    {formatearImporte(
                      (Number(item.cantidad) * Number(item.precioUnitario)).toFixed(2),
                      data.moneda,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Neto</dt>
                <dd className="tabular text-foreground">
                  {formatearImporte(data.neto, data.moneda)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IVA</dt>
                <dd className="tabular text-foreground">
                  {formatearImporte(data.iva, data.moneda)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatearImporte(data.total, data.moneda)}</dd>
              </div>
            </dl>
          </Tarjeta>

          <Tarjeta className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Emisión</dt>
                <dd className="tabular text-foreground">{formatearFecha(data.fechaEmision)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Condición de venta</dt>
                <dd className="tabular text-foreground">{data.condicionVentaDias} días</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">CAE</dt>
                <dd className="tabular text-foreground">{data.cae ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Vencimiento CAE</dt>
                <dd className="tabular text-foreground">{formatearFecha(data.caeVencimiento)}</dd>
              </div>
            </dl>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
