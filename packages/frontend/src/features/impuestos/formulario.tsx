import {
  Boton,
  Campo,
  clasesBoton,
  Entrada,
  Esqueleto,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { EncabezadoPagina } from "../../components/layout.js";
import { formatearImporte } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const formularioSchema = z.object({
  tipo: z.enum(["iva", "iibb", "ganancias", "monotributo", "otros"]),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Elegí un período"),
  baseImponible: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Usá punto decimal, máximo 2 decimales"),
  alicuota: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) <= 100, "Alícuota entre 0 y 100"),
  importePagado: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Usá punto decimal, máximo 2 decimales"),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
});

type ValoresFormulario = z.infer<typeof formularioSchema>;

const VALORES_INICIALES: ValoresFormulario = {
  tipo: "iva",
  periodo: "",
  baseImponible: "",
  alicuota: "21",
  importePagado: "0",
  fechaVencimiento: "",
};

const TIPOS = [
  { valor: "iva", etiqueta: "IVA" },
  { valor: "iibb", etiqueta: "Ingresos Brutos" },
  { valor: "ganancias", etiqueta: "Ganancias" },
  { valor: "monotributo", etiqueta: "Monotributo" },
  { valor: "otros", etiqueta: "Otros" },
] as const;

/** Vista previa del determinado. El valor de verdad lo calcula el backend con core. */
function previewDeterminado(base: string, alicuota: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(base) || !/^\d+(\.\d{1,3})?$/.test(alicuota)) {
    return null;
  }
  return ((Number(base) * Number(alicuota)) / 100).toFixed(2);
}

export function FormularioImpuesto({ impuestoId }: { impuestoId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esEdicion = Boolean(impuestoId);

  const consulta = useQuery({
    ...trpc.impuestos.obtener.queryOptions({ id: impuestoId ?? "" }),
    enabled: esEdicion,
  });

  const crear = useMutation(trpc.impuestos.crear.mutationOptions());
  const actualizar = useMutation(trpc.impuestos.actualizar.mutationOptions());
  const mutacion = esEdicion ? actualizar : crear;

  const impuesto = consulta.data;
  const form = useForm({
    defaultValues: impuesto
      ? {
          tipo: impuesto.tipo,
          periodo: impuesto.periodo.slice(0, 7),
          baseImponible: impuesto.baseImponible,
          alicuota: impuesto.alicuota,
          importePagado: impuesto.importePagado,
          fechaVencimiento: impuesto.fechaVencimiento,
        }
      : VALORES_INICIALES,
    validators: { onBlur: formularioSchema },
    onSubmit: async ({ value }) => {
      const datos = {
        tipo: value.tipo,
        periodo: value.periodo,
        baseImponible: value.baseImponible.trim(),
        alicuota: value.alicuota.trim(),
        importePagado: value.importePagado.trim(),
        fechaVencimiento: value.fechaVencimiento,
      };
      if (impuestoId) {
        await actualizar.mutateAsync({ id: impuestoId, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.impuestos.pathKey() });
      await navigate({ to: "/impuestos" });
    },
  });

  if (esEdicion && consulta.isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Editar obligación" />
        <Tarjeta className="max-w-2xl space-y-4 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-16 w-full" />
          ))}
        </Tarjeta>
      </>
    );
  }

  return (
    <>
      <Link
        to="/impuestos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a impuestos
      </Link>

      <EncabezadoPagina
        titulo={esEdicion ? "Editar obligación" : "Nueva obligación"}
        descripcion={
          esEdicion
            ? "Modificá la obligación. Los cambios quedan registrados en auditoría."
            : "El importe determinado se calcula solo a partir de la base y la alícuota."
        }
      />

      <Tarjeta className="max-w-2xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-5"
        >
          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Obligación
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="tipo">
                {(field) => (
                  <Campo etiqueta="Tipo de impuesto" requerido>
                    {({ id, describedBy }) => (
                      <Selector
                        id={id}
                        aria-describedby={describedBy}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value as ValoresFormulario["tipo"])
                        }
                        onBlur={field.handleBlur}
                      >
                        {TIPOS.map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.etiqueta}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="periodo">
                {(field) => (
                  <Campo
                    etiqueta="Período"
                    requerido
                    ayuda="Mes al que corresponde"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        type="month"
                        className="tabular"
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
            </div>
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Determinación
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="baseImponible">
                {(field) => (
                  <Campo
                    etiqueta="Base imponible"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="tabular"
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

              <form.Field name="alicuota">
                {(field) => (
                  <Campo
                    etiqueta="Alícuota (%)"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="decimal"
                        className="tabular"
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
            </div>

            <form.Subscribe selector={(s) => [s.values.baseImponible, s.values.alicuota] as const}>
              {([base, alicuota]) => {
                const determinado = previewDeterminado(base, alicuota);
                return (
                  <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">Importe determinado: </span>
                    <span className="font-medium tabular text-foreground">
                      {determinado === null ? "—" : formatearImporte(determinado)}
                    </span>
                  </div>
                );
              }}
            </form.Subscribe>
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pago y vencimiento
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="importePagado">
                {(field) => (
                  <Campo
                    etiqueta="Importe pagado"
                    ayuda="Un único importe por obligación"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="tabular"
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

              <form.Field name="fechaVencimiento">
                {(field) => (
                  <Campo
                    etiqueta="Fecha de vencimiento"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        type="date"
                        className="tabular"
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
            </div>
          </fieldset>

          {mutacion.isError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              No se pudo guardar: {mutacion.error.message}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
            <Link to="/impuestos" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  {esEdicion ? "Guardar cambios" : "Crear obligación"}
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
