import { clasesBoton, Esqueleto, EstadoVacio, Tarjeta } from "@erp/design-system";
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
import { etiquetaCondicionIva, formatearCuit, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/** Lo que le debemos a un proveedor, desde cuándo y qué le pagamos. */
export function FichaProveedor({ proveedorId }: { proveedorId: string }) {
  const trpc = useTRPC();
  const soloLectura = useModoLectura();
  const { data, isPending, isError } = useQuery(
    trpc.cuentaCorriente.proveedor.queryOptions({ id: proveedorId }),
  );

  const volver = (
    <Link
      to="/proveedores"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Volver a proveedores
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
            titulo="No se encontró el proveedor"
            descripcion="Puede que no exista o que sea de otra empresa."
          />
        </Tarjeta>
      </>
    );
  }

  const { proveedor } = data;

  return (
    <>
      {volver}
      <EncabezadoPagina
        titulo={proveedor.razonSocial}
        descripcion={[
          proveedor.cuit ? `CUIT ${formatearCuit(proveedor.cuit)}` : null,
          etiquetaCondicionIva(proveedor.condicionIva),
          proveedor.rubro,
          `Plazo de pago ${proveedor.condicionPagoDias} días`,
        ]
          .filter(Boolean)
          .join(" · ")}
        acciones={
          soloLectura ? null : (
            <Link
              to="/proveedores/$proveedorId/editar"
              params={{ proveedorId }}
              className={clasesBoton("secundario", "sm")}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Link>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Dato etiqueta="Saldo a pagar">{formatearImporte(data.saldo)}</Dato>
        <Dato etiqueta="A cuenta">
          {formatearImporte(data.aCuenta)}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Pagado sin imputar a una compra
          </span>
        </Dato>
      </div>

      <div className="space-y-4">
        <Antiguedad antiguedad={data.antiguedad} />
        <TablaAbiertos abiertos={data.abiertos} lado="compras" />
        <TablaMovimientos movimientos={data.movimientos} />
      </div>
    </>
  );
}
