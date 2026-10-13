import { hoyEnArgentina } from "@erp/core/dates";
import { Boton, Campo, Entrada, Selector, Tarjeta } from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";
import { useState } from "react";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

const IMPORTE = /^\d+(\.\d{1,2})?$/;

/**
 * Registrar el cobro de una factura desde su detalle: crea el ingreso en
 * Tesorería ya imputado a esta factura. Un cobro con cheque se carga desde
 * Tesorería, que pide elegir el cheque.
 */
export function RegistrarCobro({
  comprobanteId,
  descripcion,
  clienteId,
  moneda,
  pendiente,
}: {
  comprobanteId: string;
  descripcion: string;
  clienteId: string;
  moneda: "ARS" | "USD";
  pendiente: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cuentas = useQuery(trpc.tesoreria.cuentas.listar.queryOptions());
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState({
    fecha: hoyEnArgentina(),
    cuentaId: "",
    medioPago: "transferencia" as "transferencia" | "efectivo",
    importe: pendiente,
  });

  const crear = useMutation({
    ...trpc.tesoreria.movimientos.crear.mutationOptions(),
    onSuccess: async () => {
      // Cambia el saldo de la factura, del cliente, de la cuenta y del panel.
      await queryClient.invalidateQueries();
      setAbierto(false);
    },
  });

  // Sólo cuentas de la moneda de la factura: un cobro imputa en su moneda.
  const cuentasDeLaMoneda = cuentas.data?.items.filter((c) => c.moneda === moneda) ?? [];
  const valido = v.cuentaId !== "" && IMPORTE.test(v.importe.trim()) && v.importe.trim() !== "0";

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        onClick={() => {
          setV((x) => ({ ...x, importe: pendiente }));
          setAbierto(true);
        }}
      >
        <Banknote className="size-4" aria-hidden="true" />
        Registrar cobro
      </Boton>
    );
  }

  return (
    <Tarjeta className="mb-6 w-full p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Registrar cobro</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Queda pendiente {formatearImporte(pendiente, moneda)}. El cobro se registra en Tesorería
        imputado a esta factura; si es por menos, la factura queda parcial.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) {
            return;
          }
          const importe = v.importe.trim();
          crear.mutate({
            fecha: v.fecha,
            cuentaId: v.cuentaId,
            tipo: "ingreso",
            medioPago: v.medioPago,
            concepto: `Cobro ${descripcion}`,
            importe,
            clienteId,
            conciliado: false,
            imputaciones: [{ comprobanteId, importe }],
          });
        }}
      >
        <Campo etiqueta="Fecha">
          {({ id }) => (
            <Entrada
              id={id}
              type="date"
              className="tabular"
              value={v.fecha}
              onChange={(e) => setV({ ...v, fecha: e.target.value })}
            />
          )}
        </Campo>
        <Campo etiqueta="Cuenta" requerido>
          {({ id }) => (
            <Selector
              id={id}
              value={v.cuentaId}
              onChange={(e) => setV({ ...v, cuentaId: e.target.value })}
            >
              <option value="">Elegí una cuenta</option>
              {cuentasDeLaMoneda.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Medio">
          {({ id }) => (
            <Selector
              id={id}
              value={v.medioPago}
              onChange={(e) =>
                setV({ ...v, medioPago: e.target.value as "transferencia" | "efectivo" })
              }
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Importe" requerido>
          {({ id }) => (
            <Entrada
              id={id}
              inputMode="decimal"
              className="tabular"
              value={v.importe}
              onChange={(e) => setV({ ...v, importe: e.target.value })}
            />
          )}
        </Campo>
        {crear.isError && (
          <p role="alert" className="text-sm text-danger sm:col-span-4">
            No se pudo registrar: {mensajeDeError(crear.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-4">
          <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton type="submit" tamano="sm" disabled={!valido} cargando={crear.isPending}>
            Registrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
