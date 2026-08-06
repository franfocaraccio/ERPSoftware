import {
  Boton,
  Campo,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, PiggyBank, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { formatearImporte } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const ICONO_TIPO = {
  efectivo: Wallet,
  cuenta_corriente: Landmark,
  caja_ahorro: PiggyBank,
} as const;

const ETIQUETA_TIPO = {
  efectivo: "Efectivo",
  cuenta_corriente: "Cuenta corriente",
  caja_ahorro: "Caja de ahorro",
} as const;

const cuentaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  tipo: z.enum(["efectivo", "cuenta_corriente", "caja_ahorro"]),
  moneda: z.enum(["ARS", "USD"]),
});

function FormularioCuenta({ onListo }: { onListo: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.tesoreria.cuentas.crear.mutationOptions());

  const form = useForm({
    defaultValues: { nombre: "", tipo: "cuenta_corriente", moneda: "ARS" } as z.infer<
      typeof cuentaSchema
    >,
    validators: { onBlur: cuentaSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({ ...value, nombre: value.nombre.trim() });
      await queryClient.invalidateQueries({ queryKey: trpc.tesoreria.cuentas.pathKey() });
      onListo();
    },
  });

  return (
    <Tarjeta className="mb-4 p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="nombre">
            {(field) => (
              <Campo
                etiqueta="Nombre de la cuenta"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <Entrada
                    id={id}
                    placeholder="Banco Nación CC"
                    aria-describedby={describedBy}
                    invalido={invalido}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="tipo">
            {(field) => (
              <Campo etiqueta="Tipo">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as z.infer<typeof cuentaSchema>["tipo"])
                    }
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="cuenta_corriente">Cuenta corriente</option>
                    <option value="caja_ahorro">Caja de ahorro</option>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="moneda">
            {(field) => (
              <Campo etiqueta="Moneda">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as z.infer<typeof cuentaSchema>["moneda"])
                    }
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>
        </div>

        {crear.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo crear: {crear.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="secundario" tamano="sm" onClick={onListo}>
            Cancelar
          </Boton>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => (
              <Boton type="submit" tamano="sm" cargando={enviando}>
                Crear cuenta
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

export function Cuentas() {
  const trpc = useTRPC();
  const [creando, setCreando] = useState(false);
  const { data, isPending, isError, refetch } = useQuery(
    trpc.tesoreria.cuentas.listar.queryOptions(),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {!isPending && data && (
          <p className="text-sm text-muted-foreground">
            Saldo consolidado en pesos{" "}
            <span className="font-medium tabular text-foreground">
              {formatearImporte(data.saldoConsolidadoArs)}
            </span>
          </p>
        )}
        {!creando && (
          <Boton tamano="sm" className="ml-auto" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva cuenta
          </Boton>
        )}
      </div>

      {creando && <FormularioCuenta onListo={() => setCreando(false)} />}

      {isError ? (
        <Tarjeta>
          <EstadoVacio
            titulo="No se pudieron cargar las cuentas"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        </Tarjeta>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={<Wallet className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay cuentas"
            descripcion="Cargá tus cajas y cuentas bancarias para ver el saldo consolidado."
          />
        </Tarjeta>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((cuenta) => {
            const Icono = ICONO_TIPO[cuenta.tipo];
            const negativo = cuenta.saldo.startsWith("-");
            return (
              <Tarjeta key={cuenta.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{cuenta.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {ETIQUETA_TIPO[cuenta.tipo]} · {cuenta.moneda}
                    </p>
                  </div>
                  <Icono className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
                <p
                  className={`mt-4 text-xl font-semibold tabular ${negativo ? "text-danger" : "text-foreground"}`}
                >
                  {formatearImporte(cuenta.saldo, cuenta.moneda)}
                </p>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
