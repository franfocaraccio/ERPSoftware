import { hoyEnArgentina } from "@erp/core/dates";
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
import { Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useModoLectura } from "../../components/sesion.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { opcional, primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const importe = (mensaje: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), mensaje);

const compraSchema = z.object({
  proveedorId: z.string().min(1, "Elegí un proveedor"),
  letra: z.string(),
  numeroCompleto: z.string().trim(),
  fechaRecepcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  condicionPagoDias: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) <= 365, "Días entre 0 y 365"),
  concepto: z.string().trim(),
  neto: importe("Usá punto decimal, máximo 2 decimales"),
  iva: importe("Usá punto decimal, máximo 2 decimales"),
  total: importe("Usá punto decimal, máximo 2 decimales"),
});

type ValoresCompra = z.infer<typeof compraSchema>;

function FormularioCompra({ onListo }: { onListo: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.comprobantes.compras.crear.mutationOptions());
  const proveedores = useQuery(
    trpc.proveedores.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }),
  );

  const form = useForm({
    defaultValues: {
      proveedorId: "",
      letra: "A",
      numeroCompleto: "",
      fechaRecepcion: hoyEnArgentina(),
      condicionPagoDias: "30",
      concepto: "",
      neto: "",
      iva: "",
      total: "",
    } as ValoresCompra,
    validators: { onBlur: compraSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        proveedorId: value.proveedorId,
        letra: (value.letra || null) as "A" | "B" | "C" | "E" | null,
        numeroCompleto: opcional(value.numeroCompleto),
        fechaRecepcion: value.fechaRecepcion,
        condicionPagoDias: Number(value.condicionPagoDias),
        concepto: opcional(value.concepto),
        moneda: "ARS",
        neto: value.neto.trim(),
        iva: value.iva.trim(),
        total: value.total.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() });
      // El saldo a pagar del proveedor depende de esta compra.
      await queryClient.invalidateQueries({ queryKey: trpc.proveedores.pathKey() });
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
          <form.Field name="proveedorId">
            {(field) => (
              <Campo
                etiqueta="Proveedor"
                requerido
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
                    <option value="">Elegí un proveedor</option>
                    {proveedores.data?.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.razonSocial}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="letra">
            {(field) => (
              <Campo etiqueta="Letra">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    {["A", "B", "C", "E"].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="numeroCompleto">
            {(field) => (
              <Campo etiqueta="Número" ayuda="Como figura en el comprobante">
                {({ id }) => (
                  <Entrada
                    id={id}
                    placeholder="0003-00004567"
                    className="tabular"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="fechaRecepcion">
            {(field) => (
              <Campo
                etiqueta="Fecha de recepción"
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

          <form.Field name="condicionPagoDias">
            {(field) => (
              <Campo
                etiqueta="Condición de pago (días)"
                requerido
                ayuda="Define el vencimiento"
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

          <form.Field name="concepto">
            {(field) => (
              <Campo etiqueta="Concepto">
                {({ id }) => (
                  <Entrada
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          {/* En compras los importes se transcriben del comprobante recibido:
              no se recalculan, porque el documento lo emitió el proveedor. */}
          {(["neto", "iva", "total"] as const).map((campo) => (
            <form.Field key={campo} name={campo}>
              {(field) => (
                <Campo
                  etiqueta={campo === "iva" ? "IVA" : campo === "neto" ? "Neto" : "Total"}
                  requerido={campo === "total"}
                  error={
                    field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                  }
                >
                  {({ id, invalido }) => (
                    <Entrada
                      id={id}
                      inputMode="decimal"
                      placeholder="0.00"
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
          ))}
        </div>

        {crear.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo registrar: {crear.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="secundario" tamano="sm" onClick={onListo}>
            Cancelar
          </Boton>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => (
              <Boton type="submit" tamano="sm" cargando={enviando}>
                Registrar compra
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

export function Compras() {
  const soloLectura = useModoLectura();
  const trpc = useTRPC();
  const [creando, setCreando] = useState(false);
  const { data, isPending, isError, refetch } = useQuery(
    trpc.comprobantes.compras.listar.queryOptions({ pagina: 1, tamanoPagina: 50 }),
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        {!isPending && data && (
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {data.total === 1 ? "compra" : "compras"}
          </p>
        )}
        {!creando && !soloLectura && (
          <Boton tamano="sm" className="ml-auto" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva compra
          </Boton>
        )}
      </div>

      {creando && <FormularioCompra onListo={() => setCreando(false)} />}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar las compras"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        ) : isPending ? (
          <div className="space-y-2 p-4" role="status" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EstadoVacio
            icono={<ShoppingCart className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay compras"
            descripcion="Las compras alimentan el saldo a pagar y la proyección de egresos."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Comprobante", "Proveedor", "Recepción", "Plazo"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {["Neto", "IVA", "Total"].map((h) => (
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
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td className="px-4 py-3 tabular font-medium text-foreground">
                      {c.letra ?? "—"} {c.numeroCompleto ?? ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.proveedorRazonSocial}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {formatearFecha(c.fechaRecepcion)}
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {c.condicionPagoDias} d
                    </td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">
                      {formatearImporte(c.neto, c.moneda)}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">
                      {formatearImporte(c.iva, c.moneda)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular text-foreground">
                      {formatearImporte(c.total, c.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
