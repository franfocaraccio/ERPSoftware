import { Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatearCantidad, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Qué comprar para lo marcado "Reponer", agrupado en un pedido por
 * proveedor. Los números vienen del servidor (la regla está en core): acá
 * sólo se muestran.
 */
export function SugerenciaCompra() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.stock.reposicion.queryOptions());
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="px-5 pt-5">
        <h2 className="text-sm font-semibold text-foreground">Sugerencia de compra</h2>
        <p className="text-xs text-muted-foreground">
          Para cada producto bajo el mínimo: llegar al mínimo y cubrir lo que se vendió en los
          últimos 30 días (sin ventas, el doble del mínimo). Valuado al costo de la última compra.
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium">Producto</th>
              <th className="px-5 py-2 text-right font-medium">Stock / mínimo</th>
              <th className="px-5 py-2 text-right font-medium">Vendido 30 días</th>
              <th className="px-5 py-2 text-right font-medium">Comprar</th>
              <th className="px-5 py-2 text-right font-medium">Costo de reposición</th>
              <th className="px-5 py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          {data.map((pedido) => (
            <tbody key={pedido.proveedorId ?? "sin-proveedor"}>
              <tr className="border-t border-border bg-surface-muted/50">
                <th colSpan={5} className="px-5 py-2 text-left font-medium text-foreground">
                  {pedido.proveedorId ? (
                    <Link
                      to="/proveedores/$proveedorId"
                      params={{ proveedorId: pedido.proveedorId }}
                      className="underline-offset-4 hover:text-primary hover:underline"
                    >
                      {pedido.proveedor}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Sin proveedor asignado</span>
                  )}
                </th>
                <td className="px-5 py-2 text-right font-semibold tabular text-foreground">
                  {formatearImporte(pedido.total, pedido.items[0]?.moneda)}
                </td>
              </tr>
              {pedido.items.map((i) => (
                <tr key={i.productoId} className="border-t border-border/60">
                  <td className="px-5 py-2">
                    <Link
                      to="/stock/$productoId"
                      params={{ productoId: i.productoId }}
                      className="font-medium tabular text-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      {i.sku}
                    </Link>
                    <span className="ml-2 text-muted-foreground">{i.descripcion}</span>
                  </td>
                  <td className="px-5 py-2 text-right tabular text-muted-foreground">
                    {formatearCantidad(i.stock)} / {formatearCantidad(i.minimo)}
                  </td>
                  <td className="px-5 py-2 text-right tabular text-muted-foreground">
                    {formatearCantidad(i.salidas30Dias)}
                  </td>
                  <td className="px-5 py-2 text-right font-medium tabular text-foreground">
                    {formatearCantidad(i.cantidad)}
                  </td>
                  <td className="px-5 py-2 text-right tabular text-muted-foreground">
                    {formatearImporte(i.costoReposicion, i.moneda)}
                    {i.origenCosto === "promedio" && (
                      <span className="block text-xs">sin compras: costo promedio</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right tabular text-foreground">
                    {formatearImporte(i.importe, i.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Tarjeta>
  );
}
