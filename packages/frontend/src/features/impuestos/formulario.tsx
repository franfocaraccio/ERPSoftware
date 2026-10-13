import { Money } from "@erp/core/money";
import { determinadoImpuesto } from "@erp/core/tax";
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
import { ArrowLeft, Info } from "lucide-react";
import { z } from "zod";
import { EncabezadoPagina } from "../../components/layout.js";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearImporte } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const IMPORTE = /^\d+(\.\d{1,2})?$/;
const ALICUOTA = /^\d+(\.\d{1,3})?$/;

type Tipo = "iva" | "iibb" | "ganancias" | "monotributo" | "otros";

const formularioSchema = z
  .object({
    tipo: z.enum(["iva", "iibb", "ganancias", "monotributo", "otros"]),
    periodo: z.string().regex(/^\d{4}-\d{2}$/, "Elegí un período"),
    concepto: z.string().trim().max(100),
    modo: z.enum(["base", "fijo"]),
    baseImponible: z.string().trim(),
    alicuota: z.string().trim(),
    importeFijo: z.string().trim(),
    importePagado: z
      .string()
      .trim()
      .refine((v) => IMPORTE.test(v), "Usá punto decimal, máximo 2 decimales"),
    fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "iva") {
      return;
    }
    const porImporte = v.tipo === "ganancias" || v.tipo === "monotributo" || v.modo === "fijo";
    if (porImporte && !IMPORTE.test(v.importeFijo)) {
      ctx.addIssue({ code: "custom", path: ["importeFijo"], message: "Cargá el importe" });
    }
    if (!porImporte) {
      if (!IMPORTE.test(v.baseImponible)) {
        ctx.addIssue({ code: "custom", path: ["baseImponible"], message: "Cargá la base" });
      }
      if (!ALICUOTA.test(v.alicuota) || Number(v.alicuota) > 100) {
        ctx.addIssue({ code: "custom", path: ["alicuota"], message: "Alícuota entre 0 y 100" });
      }
    }
  });

type ValoresFormulario = z.infer<typeof formularioSchema>;

const ETIQUETA_TIPO: Record<Tipo, string> = {
  iva: "IVA",
  iibb: "Ingresos Brutos",
  ganancias: "Ganancias",
  monotributo: "Monotributo",
  otros: "Otros",
};

/** Los mismos que acepta el backend para cada régimen. */
const TIPOS_POR_REGIMEN: Record<string, Tipo[]> = {
  responsable_inscripto: ["iva", "iibb", "ganancias", "otros"],
  monotributo: ["monotributo", "iibb", "otros"],
};

const CONCEPTOS_GANANCIAS = [
  ...Array.from({ length: 10 }, (_, i) => `Anticipo ${i + 1}`),
  "Saldo DDJJ",
];

/** Vista previa con la misma función de core que usa el backend. */
function previewDeterminado(v: ValoresFormulario): string | null {
  const porImporte = v.tipo === "ganancias" || v.tipo === "monotributo" || v.modo === "fijo";
  if (porImporte) {
    return IMPORTE.test(v.importeFijo) ? v.importeFijo : null;
  }
  if (!IMPORTE.test(v.baseImponible) || !ALICUOTA.test(v.alicuota)) {
    return null;
  }
  return determinadoImpuesto({
    importeFijo: null,
    base: Money.desdeString(v.baseImponible, "ARS"),
    alicuota: v.alicuota,
  }).aStringFiscal();
}

/** Un campo de importe o texto simple, repetido en todo el formulario. */
function CampoTexto({
  etiqueta,
  ayuda,
  requerido,
  error,
  value,
  onChange,
  onBlur,
  tipo,
  placeholder,
}: {
  etiqueta: string;
  ayuda?: string | undefined;
  requerido?: boolean;
  error: string | undefined;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  tipo?: "date" | "month";
  placeholder?: string;
}) {
  return (
    <Campo
      etiqueta={etiqueta}
      {...(ayuda ? { ayuda } : {})}
      {...(requerido ? { requerido } : {})}
      error={error}
    >
      {({ id, describedBy, invalido }) => (
        <Entrada
          id={id}
          {...(tipo ? { type: tipo } : { inputMode: "decimal" as const })}
          {...(placeholder ? { placeholder } : {})}
          className="tabular"
          aria-describedby={describedBy}
          invalido={invalido}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      )}
    </Campo>
  );
}

export function FormularioImpuesto({
  impuestoId,
  tipoInicial,
  periodoInicial,
}: {
  impuestoId?: string;
  /** Para "Registrar pago" de una posición de IVA desde la lista. */
  tipoInicial?: Tipo;
  periodoInicial?: string;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esEdicion = Boolean(impuestoId);

  const consulta = useQuery({
    ...trpc.impuestos.obtener.queryOptions({ id: impuestoId ?? "" }),
    enabled: esEdicion,
  });
  const parametros = useQuery(trpc.parametros.obtener.queryOptions());

  const crear = useMutation(trpc.impuestos.crear.mutationOptions());
  const actualizar = useMutation(trpc.impuestos.actualizar.mutationOptions());
  const mutacion = esEdicion ? actualizar : crear;

  const impuesto = consulta.data;
  // Un IVA cargado a mano antes de que el sistema lo calculara: se corrige su
  // pago y vencimiento, no su determinación.
  const ivaHistorico = impuesto?.tipo === "iva" && !impuesto.calculado;
  const regimen = parametros.data?.regimenFiscal ?? "responsable_inscripto";
  const tipos = TIPOS_POR_REGIMEN[regimen] ?? [];

  const form = useForm({
    defaultValues: impuesto
      ? {
          tipo: impuesto.tipo,
          periodo: impuesto.periodo.slice(0, 7),
          concepto: impuesto.concepto ?? "",
          modo: impuesto.importeFijo ? ("fijo" as const) : ("base" as const),
          baseImponible: impuesto.baseImponible ?? "",
          alicuota: impuesto.alicuota ?? "",
          importeFijo: impuesto.importeFijo ?? "",
          importePagado: impuesto.importePagado,
          fechaVencimiento: impuesto.fechaVencimiento,
        }
      : ({
          tipo: tipoInicial ?? (regimen === "monotributo" ? "monotributo" : "iibb"),
          periodo: periodoInicial ?? "",
          concepto: "",
          modo: "base",
          baseImponible: "",
          alicuota: "",
          importeFijo: "",
          importePagado: "0",
          fechaVencimiento: "",
        } as ValoresFormulario),
    validators: { onBlur: formularioSchema },
    onSubmit: async ({ value }) => {
      const porImporte =
        value.tipo === "ganancias" || value.tipo === "monotributo" || value.modo === "fijo";
      const datos = {
        tipo: value.tipo,
        periodo: value.periodo,
        concepto: value.concepto.trim() || undefined,
        baseImponible:
          ivaHistorico || (value.tipo !== "iva" && !porImporte) ? value.baseImponible : null,
        alicuota: ivaHistorico || (value.tipo !== "iva" && !porImporte) ? value.alicuota : null,
        importeFijo: value.tipo !== "iva" && porImporte ? value.importeFijo : null,
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

  if ((esEdicion && consulta.isPending) || parametros.isPending) {
    return (
      <>
        <EncabezadoPagina titulo={esEdicion ? "Editar obligación" : "Nueva obligación"} />
        <Tarjeta className="max-w-2xl space-y-4 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-16 w-full" />
          ))}
        </Tarjeta>
      </>
    );
  }

  const errorDe = (meta: { isBlurred: boolean; errors: unknown[] }) =>
    meta.isBlurred ? primerError(meta.errors) : undefined;

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
        titulo={
          tipoInicial === "iva" && !esEdicion
            ? "Registrar pago de IVA"
            : esEdicion
              ? "Editar obligación"
              : "Nueva obligación"
        }
        descripcion="Los cambios quedan registrados en el historial."
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
                        disabled={esEdicion}
                        onChange={(e) => field.handleChange(e.target.value as Tipo)}
                        onBlur={field.handleBlur}
                      >
                        {/* Al editar, el tipo de la fila aunque ya no sea del régimen. */}
                        {(esEdicion && impuesto ? [impuesto.tipo] : tipos).map((t) => (
                          <option key={t} value={t}>
                            {ETIQUETA_TIPO[t]}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="periodo">
                {(field) => (
                  <CampoTexto
                    etiqueta="Período"
                    ayuda="Mes al que corresponde"
                    requerido
                    tipo="month"
                    error={errorDe(field.state.meta)}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </div>
          </fieldset>

          <form.Subscribe selector={(s) => s.values}>
            {(v) =>
              v.tipo === "iva" ? (
                <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {ivaHistorico
                    ? "Este IVA se cargó a mano antes de que el sistema lo calculara: se conserva como histórico. Podés corregir el pago y el vencimiento."
                    : "El IVA a pagar lo calcula el sistema con las ventas y compras del período (débito menos crédito fiscal). Acá se registra sólo lo que se pagó."}
                </p>
              ) : (
                <fieldset className="space-y-5 border-0 p-0">
                  <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Determinación
                  </legend>

                  {v.tipo === "ganancias" && (
                    <form.Field name="concepto">
                      {(field) => (
                        <Campo etiqueta="Concepto" requerido ayuda="Anticipo o saldo de la DDJJ">
                          {({ id }) => (
                            <Selector
                              id={id}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                            >
                              <option value="">Elegí</option>
                              {CONCEPTOS_GANANCIAS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </Selector>
                          )}
                        </Campo>
                      )}
                    </form.Field>
                  )}

                  {(v.tipo === "iibb" || v.tipo === "otros") && (
                    <form.Field name="modo">
                      {(field) => (
                        <Campo etiqueta="Cómo se determina">
                          {({ id }) => (
                            <Selector
                              id={id}
                              value={field.state.value}
                              onChange={(e) =>
                                field.handleChange(e.target.value as ValoresFormulario["modo"])
                              }
                            >
                              <option value="base">Base imponible por alícuota</option>
                              <option value="fijo">Importe fijo</option>
                            </Selector>
                          )}
                        </Campo>
                      )}
                    </form.Field>
                  )}

                  {v.tipo === "ganancias" || v.tipo === "monotributo" || v.modo === "fijo" ? (
                    <form.Field name="importeFijo">
                      {(field) => (
                        <CampoTexto
                          etiqueta={v.tipo === "monotributo" ? "Cuota del mes" : "Importe"}
                          ayuda={
                            v.tipo === "ganancias"
                              ? "El que informa ARCA o el contador: el sistema no lo estima"
                              : undefined
                          }
                          requerido
                          placeholder="0.00"
                          error={errorDe(field.state.meta)}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <form.Field name="baseImponible">
                        {(field) => (
                          <CampoTexto
                            etiqueta="Base imponible"
                            requerido
                            placeholder="0.00"
                            error={errorDe(field.state.meta)}
                            value={field.state.value}
                            onChange={field.handleChange}
                            onBlur={field.handleBlur}
                          />
                        )}
                      </form.Field>
                      <form.Field name="alicuota">
                        {(field) => (
                          <CampoTexto
                            etiqueta="Alícuota (%)"
                            requerido
                            error={errorDe(field.state.meta)}
                            value={field.state.value}
                            onChange={field.handleChange}
                            onBlur={field.handleBlur}
                          />
                        )}
                      </form.Field>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">Importe determinado: </span>
                    <span className="font-medium tabular text-foreground">
                      {formatearImporte(previewDeterminado(v))}
                    </span>
                    {v.tipo === "iibb" && (
                      <span className="block text-xs text-muted-foreground">
                        Las retenciones, percepciones y SIRCREB del período se descuentan solas.
                      </span>
                    )}
                  </div>
                </fieldset>
              )
            }
          </form.Subscribe>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pago y vencimiento
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="importePagado">
                {(field) => (
                  <CampoTexto
                    etiqueta="Importe pagado"
                    ayuda="Un único importe por obligación"
                    placeholder="0.00"
                    error={errorDe(field.state.meta)}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>

              <form.Field name="fechaVencimiento">
                {(field) => (
                  <CampoTexto
                    etiqueta="Fecha de vencimiento"
                    requerido
                    tipo="date"
                    error={errorDe(field.state.meta)}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </div>
          </fieldset>

          {mutacion.isError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              No se pudo guardar: {mensajeDeError(mutacion.error)}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
            <Link to="/impuestos" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  {esEdicion ? "Guardar cambios" : "Guardar"}
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
