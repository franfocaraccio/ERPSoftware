import { Boton, Campo, Entrada, Esqueleto, Insignia, Tarjeta } from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useModoLectura } from "../../components/sesion.js";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearCantidad, formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

const ETIQUETA = {
  inicial: "Stock inicial",
  venta: "Venta",
  devolucion: "Devolución",
  compra: "Compra",
  ajuste: "Ajuste",
} as const;

const CANTIDAD = /^-?\d+(\.\d{1,3})?$/;

/**
 * La historia del stock de un producto, y la única forma de corregirlo a mano:
 * un ajuste con su motivo. El stock no se edita en el formulario.
 */
export function MovimientosStock({ productoId }: { productoId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const soloLectura = useModoLectura();
  const { data, isPending } = useQuery(trpc.stock.movimientos.queryOptions({ productoId }));
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");

  const ajustar = useMutation({
    ...trpc.stock.ajustar.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
      setCantidad("");
      setMotivo("");
    },
  });
  const valido =
    CANTIDAD.test(cantidad.trim()) &&
    !/^-?0+(\.0+)?$/.test(cantidad.trim()) &&
    motivo.trim() !== "";

  return (
    <Tarjeta className="mt-6 max-w-2xl overflow-hidden">
      <div className="px-5 pt-5">
        <h2 className="text-sm font-semibold text-foreground">Movimientos de stock</h2>
        <p className="text-xs text-muted-foreground">
          Las ventas confirmadas descuentan, las notas de crédito devuelven y las compras con
          productos suman. Para corregir a mano, un ajuste.
        </p>
      </div>

      {!soloLectura && (
        <form
          className="mx-5 mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) {
              ajustar.mutate({ productoId, cantidad: cantidad.trim(), motivo: motivo.trim() });
            }
          }}
        >
          <Campo etiqueta="Ajuste" ayuda="Negativo para restar">
            {({ id }) => (
              <Entrada
                id={id}
                inputMode="decimal"
                className="tabular"
                placeholder="-3"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            )}
          </Campo>
          <Campo etiqueta="Motivo">
            {({ id }) => (
              <Entrada
                id={id}
                placeholder="Conteo físico, rotura…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            )}
          </Campo>
          <Boton type="submit" tamano="sm" disabled={!valido} cargando={ajustar.isPending}>
            Ajustar
          </Boton>
          {ajustar.isError && (
            <p role="alert" className="text-sm text-danger sm:col-span-3">
              {mensajeDeError(ajustar.error)}
            </p>
          )}
        </form>
      )}

      {isPending ? (
        <Esqueleto className="m-5 h-24" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {data?.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-5 py-2 tabular text-muted-foreground">
                    {formatearFecha(m.fecha)}
                  </td>
                  <td className="px-5 py-2">
                    <Insignia>{ETIQUETA[m.tipo]}</Insignia>
                    {m.motivo && (
                      <span className="ml-2 text-xs text-muted-foreground">{m.motivo}</span>
                    )}
                  </td>
                  <td
                    className={`px-5 py-2 text-right font-medium tabular ${m.cantidad.startsWith("-") ? "text-danger" : "text-foreground"}`}
                  >
                    {m.cantidad.startsWith("-") ? "" : "+"}
                    {formatearCantidad(m.cantidad)}
                  </td>
                  <td className="px-5 py-2 text-right text-xs tabular text-muted-foreground">
                    {m.costoUnitario ? `a ${formatearImporte(m.costoUnitario)}` : ""}
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
