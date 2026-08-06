import { hoyEnArgentina } from "@erp/core/dates";
import { type AlicuotaIva, calcularComprobante } from "@erp/core/invoicing";
import { Boton, Campo, Entrada, Selector, Tarjeta } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { z } from "zod";
import { EncabezadoPagina } from "../../components/layout.js";
import { formatearImporte } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const ALICUOTAS: { valor: AlicuotaIva; etiqueta: string }[] = [
  { valor: "21", etiqueta: "21 %" },
  { valor: "10.5", etiqueta: "10,5 %" },
  { valor: "27", etiqueta: "27 %" },
  { valor: "5", etiqueta: "5 %" },
  { valor: "2.5", etiqueta: "2,5 %" },
  { valor: "0", etiqueta: "0 %" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "no_gravado", etiqueta: "No gravado" },
];

const itemSchema = z.object({
  descripcion: z.string().trim().min(1, "Poné una descripción"),
  cantidad: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Cantidad mayor a cero"),
  precioUnitario: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Usá punto decimal, máximo 2 decimales"),
  alicuotaIva: z.enum(["0", "2.5", "5", "10.5", "21", "27", "exento", "no_gravado"]),
});

const ventaSchema = z.object({
  clase: z.enum(["factura", "nota_credito", "nota_debito"]),
  clienteId: z.string().min(1, "Elegí un cliente"),
  puntoVenta: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "Punto de venta inválido"),
  numero: z.string().trim(),
  fechaEmision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  condicionVentaDias: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) <= 365, "Días entre 0 y 365"),
  items: z.array(itemSchema).min(1, "Cargá al menos un ítem"),
});

type ValoresVenta = z.infer<typeof ventaSchema>;

const ITEM_VACIO = {
  descripcion: "",
  cantidad: "1",
  precioUnitario: "",
  alicuotaIva: "21" as const,
};

/**
 * Vista previa con la MISMA función que usa el backend: el total que ve el
 * usuario mientras carga es exactamente el que se va a persistir.
 */
function totalesPreview(items: ValoresVenta["items"]) {
  const validos = items.filter(
    (i) => /^\d+(\.\d{1,3})?$/.test(i.cantidad) && /^\d+(\.\d{1,2})?$/.test(i.precioUnitario),
  );
  if (validos.length === 0) {
    return null;
  }
  return calcularComprobante(validos, "ARS");
}

export function FormularioComprobante() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clientes = useQuery(trpc.clientes.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }));
  const productos = useQuery(
    trpc.stock.listar.queryOptions({ soloReponer: false, pagina: 1, tamanoPagina: 100 }),
  );
  const crear = useMutation(trpc.comprobantes.ventas.crear.mutationOptions());

  const form = useForm({
    defaultValues: {
      clase: "factura",
      clienteId: "",
      puntoVenta: "1",
      numero: "",
      fechaEmision: hoyEnArgentina(),
      condicionVentaDias: "30",
      items: [ITEM_VACIO],
    } as ValoresVenta,
    validators: { onBlur: ventaSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        clase: value.clase,
        clienteId: value.clienteId,
        puntoVenta: Number(value.puntoVenta),
        numero: value.numero ? Number(value.numero) : null,
        fechaEmision: value.fechaEmision,
        condicionVentaDias: Number(value.condicionVentaDias),
        moneda: "ARS",
        items: value.items.map((i) => ({
          descripcion: i.descripcion.trim(),
          cantidad: i.cantidad.trim(),
          precioUnitario: i.precioUnitario.trim(),
          alicuotaIva: i.alicuotaIva,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() });
      await navigate({ to: "/comprobantes" });
    },
  });

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
        titulo="Nuevo comprobante"
        descripcion="La letra se determina sola por la condición IVA del cliente. Se crea en borrador."
      />

      <Tarjeta className="max-w-4xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-6"
        >
          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Encabezado
            </legend>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <form.Field name="clase">
                {(field) => (
                  <Campo etiqueta="Clase">
                    {({ id }) => (
                      <Selector
                        id={id}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value as ValoresVenta["clase"])
                        }
                      >
                        <option value="factura">Factura</option>
                        <option value="nota_credito">Nota de crédito</option>
                        <option value="nota_debito">Nota de débito</option>
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="clienteId">
                {(field) => (
                  <Campo
                    etiqueta="Cliente"
                    requerido
                    ayuda="Define la letra del comprobante"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Selector
                        id={id}
                        invalido={invalido}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      >
                        <option value="">Elegí un cliente</option>
                        {clientes.data?.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.razonSocial}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="fechaEmision">
                {(field) => (
                  <Campo
                    etiqueta="Fecha de emisión"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Entrada
                        id={id}
                        type="date"
                        className="tabular"
                        invalido={invalido}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="puntoVenta">
                {(field) => (
                  <Campo
                    etiqueta="Punto de venta"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
                        className="tabular"
                        invalido={invalido}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="numero">
                {(field) => (
                  <Campo etiqueta="Número" ayuda="Lo asignará ARCA al emitir">
                    {({ id }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
                        className="tabular"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="condicionVentaDias">
                {(field) => (
                  <Campo
                    etiqueta="Condición de venta (días)"
                    requerido
                    ayuda="0 = contado"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
                        className="tabular"
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

          <fieldset className="space-y-4 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Ítems
            </legend>

            <form.Field name="items" mode="array">
              {(campoItems) => (
                <div className="space-y-3">
                  {campoItems.state.value.map((_, indice) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: el índice es la identidad de la fila
                      key={indice}
                      className="grid items-end gap-3 rounded-lg border border-border bg-surface-muted/40 p-3 sm:grid-cols-[1fr_5rem_8rem_8rem_auto]"
                    >
                      <form.Field name={`items[${indice}].descripcion`}>
                        {(field) => (
                          <Campo etiqueta="Descripción" requerido>
                            {({ id }) => (
                              <Entrada
                                id={id}
                                list="productos-sugeridos"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].cantidad`}>
                        {(field) => (
                          <Campo etiqueta="Cant.">
                            {({ id }) => (
                              <Entrada
                                id={id}
                                inputMode="decimal"
                                className="tabular"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].precioUnitario`}>
                        {(field) => (
                          <Campo etiqueta="Precio unit.">
                            {({ id }) => (
                              <Entrada
                                id={id}
                                inputMode="decimal"
                                placeholder="0.00"
                                className="tabular"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].alicuotaIva`}>
                        {(field) => (
                          <Campo etiqueta="IVA">
                            {({ id }) => (
                              <Selector
                                id={id}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value as AlicuotaIva)}
                              >
                                {ALICUOTAS.map((a) => (
                                  <option key={a.valor} value={a.valor}>
                                    {a.etiqueta}
                                  </option>
                                ))}
                              </Selector>
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <Boton
                        variante="fantasma"
                        tamano="icono"
                        aria-label={`Quitar ítem ${indice + 1}`}
                        disabled={campoItems.state.value.length === 1}
                        onClick={() => campoItems.removeValue(indice)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Boton>
                    </div>
                  ))}

                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => campoItems.pushValue(ITEM_VACIO)}
                  >
                    Agregar ítem
                  </Boton>
                </div>
              )}
            </form.Field>

            {/* Sugerencias del catálogo, sin obligar a elegir de la lista. */}
            <datalist id="productos-sugeridos">
              {productos.data?.items.map((p) => (
                <option key={p.id} value={p.descripcion} />
              ))}
            </datalist>
          </fieldset>

          <form.Subscribe selector={(s) => s.values.items}>
            {(items) => {
              const totales = totalesPreview(items);
              return (
                <div className="rounded-lg border border-border bg-surface-muted px-4 py-3">
                  {totales === null ? (
                    <p className="text-sm text-muted-foreground">
                      Cargá cantidad y precio para ver los totales.
                    </p>
                  ) : (
                    <dl className="space-y-1 text-sm">
                      {totales.porAlicuota.map((g) => (
                        <div
                          key={g.alicuota}
                          className="flex justify-between text-muted-foreground"
                        >
                          <dt>
                            IVA {g.alicuota.replace(".", ",")} % sobre{" "}
                            {formatearImporte(g.baseImponible.aStringFiscal())}
                          </dt>
                          <dd className="tabular">{formatearImporte(g.importe.aStringFiscal())}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between text-muted-foreground">
                        <dt>Neto</dt>
                        <dd className="tabular">
                          {formatearImporte(totales.neto.aStringFiscal())}
                        </dd>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
                        <dt>Total</dt>
                        <dd className="tabular">
                          {formatearImporte(totales.total.aStringFiscal())}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              );
            }}
          </form.Subscribe>

          {crear.isError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              No se pudo guardar: {crear.error.message}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
            <Link to="/comprobantes">
              <Boton variante="secundario" tamano="sm" type="button">
                Cancelar
              </Boton>
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  Crear borrador
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
