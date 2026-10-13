import { clasesBoton, Esqueleto, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";
import {
  Antiguedad,
  Dato,
  TablaAbiertos,
  TablaMovimientos,
} from "../../components/cuenta-corriente.js";
import { EncabezadoPagina } from "../../components/layout.js";
import { useModoLectura } from "../../components/sesion.js";
import {
  etiquetaCondicionIva,
  formatearCuit,
  formatearFecha,
  formatearImporte,
  formatearPorcentaje,
} from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Todo lo de un cliente en una pantalla: cuánto debe, desde cuándo, si está en
 * mora y cuánto crédito le queda. Antes la única vista de un cliente era el
 * formulario para editarlo.
 */
export function FichaCliente({ clienteId }: { clienteId: string }) {
  const trpc = useTRPC();
  const soloLectura = useModoLectura();
  const { data, isPending, isError } = useQuery(
    trpc.cuentaCorriente.cliente.queryOptions({ id: clienteId }),
  );

  const volver = (
    <Link
      to="/clientes"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Volver a clientes
    </Link>
  );

  if (isPending) {
    return (
      <>
        {volver}
        <div className="space-y-3">
          <Esqueleto className="h-10 w-1/2" />
          <Esqueleto className="h-24 w-full" />
          <Esqueleto className="h-48 w-full" />
        </div>
      </>
    );
  }
  if (isError || !data) {
    return (
      <>
        {volver}
        <Tarjeta>
          <EstadoVacio
            icono={<AlertTriangle className="size-8" aria-hidden="true" />}
            titulo="No se encontró el cliente"
            descripcion="Puede que no exista o que sea de otra empresa."
          />
        </Tarjeta>
      </>
    );
  }

  const { cliente } = data;
  const debe = !data.saldo.startsWith("-") && data.saldo !== "0.00";

  return (
    <>
      {volver}
      <EncabezadoPagina
        titulo={cliente.razonSocial}
        descripcion={[
          cliente.cuit ? `CUIT ${formatearCuit(cliente.cuit)}` : null,
          etiquetaCondicionIva(cliente.condicionIva),
        ]
          .filter(Boolean)
          .join(" · ")}
        acciones={
          soloLectura ? null : (
            <Link
              to="/clientes/$clienteId/editar"
              params={{ clienteId }}
              className={clasesBoton("secundario", "sm")}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {data.enMora && (
          <Insignia tono="peligro">
            En mora: deuda vencida hace más de {data.umbralMoraDias} días
          </Insignia>
        )}
        {cliente.estado === "inactivo" && <Insignia tono="neutro">Inactivo</Insignia>}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Dato etiqueta={debe ? "Saldo a cobrar" : "Saldo"}>{formatearImporte(data.saldo)}</Dato>
        <Dato etiqueta="Límite de crédito" alerta={data.excedeLimite}>
          {cliente.limiteCredito ? (
            <>
              {formatearImporte(cliente.limiteCredito)}
              {data.creditoUsado && (
                <span className="ml-2 text-sm font-normal">
                  · usado {formatearPorcentaje(data.creditoUsado)}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Sin límite</span>
          )}
        </Dato>
        <Dato etiqueta="A cuenta">
          {formatearImporte(data.aCuenta)}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Pagado sin imputar a una factura
          </span>
        </Dato>
      </div>

      {data.excedeLimite && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          El saldo supera el límite de crédito. Se puede seguir facturando: es un aviso.
        </p>
      )}

      <div className="space-y-4">
        <Antiguedad antiguedad={data.antiguedad} />
        <TablaAbiertos abiertos={data.abiertos} lado="ventas" />

        {data.cheques.length > 0 && (
          <Tarjeta className="overflow-hidden">
            <h2 className="px-4 pt-4 text-sm font-semibold text-foreground">
              Cheques en cartera y depositados
            </h2>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full border-collapse text-sm">
                <tbody>
                  {data.cheques.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 tabular">N° {c.numero}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.banco ?? "—"}</td>
                      <td className="px-4 py-2 tabular text-muted-foreground">
                        Pago {formatearFecha(c.fechaPago)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular">
                        {formatearImporte(c.importe)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

        <TablaMovimientos movimientos={data.movimientos} />
      </div>
    </>
  );
}
