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
import { opcional, primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const importe = (mensaje: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), mensaje);

const formularioSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria"),
  categoria: z.string().trim(),
  moneda: z.enum(["ARS", "USD"]),
  costoUnitario: importe("Usá punto decimal, máximo 2 decimales"),
  precioVenta: importe("Usá punto decimal, máximo 2 decimales"),
  stockActual: z
    .string()
    .trim()
    .refine((v) => /^-?\d+(\.\d{1,3})?$/.test(v), "Cantidad inválida (hasta 3 decimales)"),
  stockMinimo: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), "Cantidad inválida (hasta 3 decimales)"),
  proveedorPrincipalId: z.string(),
});

type ValoresFormulario = z.infer<typeof formularioSchema>;

const VALORES_INICIALES: ValoresFormulario = {
  sku: "",
  descripcion: "",
  categoria: "",
  moneda: "ARS",
  costoUnitario: "",
  precioVenta: "",
  stockActual: "0",
  stockMinimo: "0",
  proveedorPrincipalId: "",
};

export function FormularioProducto({ productoId }: { productoId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esEdicion = Boolean(productoId);

  const consulta = useQuery({
    ...trpc.stock.obtener.queryOptions({ id: productoId ?? "" }),
    enabled: esEdicion,
  });

  // Para elegir proveedor principal sin salir del formulario.
  const proveedores = useQuery(
    trpc.proveedores.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }),
  );

  const crear = useMutation(trpc.stock.crear.mutationOptions());
  const actualizar = useMutation(trpc.stock.actualizar.mutationOptions());
  const mutacion = esEdicion ? actualizar : crear;

  const producto = consulta.data;
  const form = useForm({
    defaultValues: producto
      ? {
          sku: producto.sku,
          descripcion: producto.descripcion,
          categoria: producto.categoria ?? "",
          moneda: producto.moneda,
          costoUnitario: producto.costoUnitario ?? "",
          precioVenta: producto.precioVenta ?? "",
          stockActual: producto.stockActual,
          stockMinimo: producto.stockMinimo,
          proveedorPrincipalId: producto.proveedorPrincipalId ?? "",
        }
      : VALORES_INICIALES,
    validators: { onBlur: formularioSchema },
    onSubmit: async ({ value }) => {
      const datos = {
        sku: value.sku.trim(),
        descripcion: value.descripcion.trim(),
        categoria: opcional(value.categoria),
        moneda: value.moneda,
        costoUnitario: opcional(value.costoUnitario),
        precioVenta: opcional(value.precioVenta),
        stockActual: value.stockActual.trim(),
        stockMinimo: value.stockMinimo.trim(),
        proveedorPrincipalId: value.proveedorPrincipalId || null,
      };
      if (productoId) {
        await actualizar.mutateAsync({ id: productoId, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
      await navigate({ to: "/stock" });
    },
  });

  if (esEdicion && consulta.isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Editar producto" />
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
        to="/stock"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a stock
      </Link>

      <EncabezadoPagina
        titulo={esEdicion ? "Editar producto" : "Nuevo producto"}
        descripcion={
          esEdicion
            ? "Modificá el producto. Los cambios de stock quedan registrados en auditoría."
            : "El stock mínimo dispara el aviso de reposición; el costo alimenta la valorización."
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
              Identificación
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="sku">
                {(field) => (
                  <Campo
                    etiqueta="SKU"
                    requerido
                    ayuda="Único por empresa"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
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

              <form.Field name="categoria">
                {(field) => (
                  <Campo etiqueta="Categoría">
                    {({ id, describedBy }) => (
                      <Entrada
                        id={id}
                        aria-describedby={describedBy}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>
            </div>

            <form.Field name="descripcion">
              {(field) => (
                <Campo
                  etiqueta="Descripción"
                  requerido
                  error={
                    field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                  }
                >
                  {({ id, describedBy, invalido }) => (
                    <Entrada
                      id={id}
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

            <form.Field name="proveedorPrincipalId">
              {(field) => (
                <Campo etiqueta="Proveedor principal">
                  {({ id, describedBy }) => (
                    <Selector
                      id={id}
                      aria-describedby={describedBy}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    >
                      <option value="">Sin proveedor asignado</option>
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
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Precios
            </legend>

            <div className="grid gap-5 sm:grid-cols-3">
              <form.Field name="moneda">
                {(field) => (
                  <Campo etiqueta="Moneda">
                    {({ id, describedBy }) => (
                      <Selector
                        id={id}
                        aria-describedby={describedBy}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value as ValoresFormulario["moneda"])
                        }
                        onBlur={field.handleBlur}
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="costoUnitario">
                {(field) => (
                  <Campo
                    etiqueta="Costo unitario"
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

              <form.Field name="precioVenta">
                {(field) => (
                  <Campo
                    etiqueta="Precio de venta"
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
            </div>
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Existencias
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="stockActual">
                {(field) => (
                  <Campo
                    etiqueta="Stock actual"
                    requerido
                    ayuda="Carga manual en esta etapa"
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

              <form.Field name="stockMinimo">
                {(field) => (
                  <Campo
                    etiqueta="Stock mínimo"
                    requerido
                    ayuda="Al llegar a este nivel se avisa reponer"
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
            <Link to="/stock" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  {esEdicion ? "Guardar cambios" : "Crear producto"}
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
