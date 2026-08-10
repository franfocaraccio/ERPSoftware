import { validarCuit } from "@erp/core/tax";
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
import { mensajeDeError } from "../../lib/errores.js";
import { opcional, primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

// Feedback temprano; el servidor revalida con sus propios schemas
// (incluido el dígito verificador del CUIT).
const formularioSchema = z.object({
  razonSocial: z.string().trim().min(1, "La razón social es obligatoria"),
  // Ver el comentario en clientes/formulario.tsx: la regla vive en @erp/core
  // para que el formulario y el backend no puedan discrepar.
  cuit: z
    .string()
    .trim()
    .refine((v) => v === "" || validarCuit(v), "CUIT inválido (revisá el dígito verificador)"),
  condicionIva: z.enum(["responsable_inscripto", "monotributo", "exento", "consumidor_final"]),
  rubro: z.string().trim(),
  condicionPagoDias: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) <= 365, "Ingresá un número de días entre 0 y 365"),
  cbu: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{22}$/.test(v), "El CBU tiene 22 dígitos"),
  aliasCbu: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email inválido"),
  telefono: z.string().trim(),
});

type ValoresFormulario = z.infer<typeof formularioSchema>;

const VALORES_INICIALES: ValoresFormulario = {
  razonSocial: "",
  cuit: "",
  condicionIva: "responsable_inscripto",
  rubro: "",
  condicionPagoDias: "30",
  cbu: "",
  aliasCbu: "",
  email: "",
  telefono: "",
};

const CONDICIONES_IVA = [
  { valor: "responsable_inscripto", etiqueta: "Responsable Inscripto" },
  { valor: "monotributo", etiqueta: "Monotributo" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "consumidor_final", etiqueta: "Consumidor Final" },
] as const;

export function FormularioProveedor({ proveedorId }: { proveedorId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esEdicion = Boolean(proveedorId);

  const consulta = useQuery({
    ...trpc.proveedores.obtener.queryOptions({ id: proveedorId ?? "" }),
    enabled: esEdicion,
  });

  const crear = useMutation(trpc.proveedores.crear.mutationOptions());
  const actualizar = useMutation(trpc.proveedores.actualizar.mutationOptions());
  const mutacion = esEdicion ? actualizar : crear;

  const proveedor = consulta.data;
  const form = useForm({
    defaultValues: proveedor
      ? {
          razonSocial: proveedor.razonSocial,
          cuit: proveedor.cuit ?? "",
          condicionIva: proveedor.condicionIva,
          rubro: proveedor.rubro ?? "",
          condicionPagoDias: String(proveedor.condicionPagoDias),
          cbu: proveedor.cbu ?? "",
          aliasCbu: proveedor.aliasCbu ?? "",
          email: proveedor.email ?? "",
          telefono: proveedor.telefono ?? "",
        }
      : VALORES_INICIALES,
    validators: { onBlur: formularioSchema },
    onSubmit: async ({ value }) => {
      const datos = {
        razonSocial: value.razonSocial.trim(),
        cuit: opcional(value.cuit),
        condicionIva: value.condicionIva,
        rubro: opcional(value.rubro),
        condicionPagoDias: Number(value.condicionPagoDias),
        cbu: opcional(value.cbu),
        aliasCbu: opcional(value.aliasCbu),
        email: opcional(value.email),
        telefono: opcional(value.telefono),
      };
      if (proveedorId) {
        await actualizar.mutateAsync({ id: proveedorId, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.proveedores.pathKey() });
      await navigate({ to: "/proveedores" });
    },
  });

  if (esEdicion && consulta.isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Editar proveedor" />
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
        to="/proveedores"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a proveedores
      </Link>

      <EncabezadoPagina
        titulo={esEdicion ? "Editar proveedor" : "Nuevo proveedor"}
        descripcion={
          esEdicion
            ? "Modificá los datos del proveedor. Los cambios quedan registrados en auditoría."
            : "La condición de pago define cuándo vence cada compra en la proyección de caja."
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
              Datos fiscales
            </legend>

            <form.Field name="razonSocial">
              {(field) => (
                <Campo
                  etiqueta="Razón social"
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
                      autoComplete="organization"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </Campo>
              )}
            </form.Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="cuit">
                {(field) => (
                  <Campo
                    etiqueta="CUIT"
                    ayuda="11 dígitos, con o sin guiones. El último es verificador."
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        aria-describedby={describedBy}
                        invalido={invalido}
                        inputMode="numeric"
                        placeholder="30-70308853-4"
                        className="tabular"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="condicionIva">
                {(field) => (
                  <Campo etiqueta="Condición frente al IVA" requerido>
                    {({ id, describedBy }) => (
                      <Selector
                        id={id}
                        aria-describedby={describedBy}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value as ValoresFormulario["condicionIva"])
                        }
                        onBlur={field.handleBlur}
                      >
                        {CONDICIONES_IVA.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>
            </div>
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Condiciones comerciales
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="rubro">
                {(field) => (
                  <Campo etiqueta="Rubro" ayuda="Para segmentar compras y negociar condiciones">
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

              <form.Field name="condicionPagoDias">
                {(field) => (
                  <Campo
                    etiqueta="Condición de pago (días)"
                    requerido
                    ayuda="0 = contado"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
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
              Datos de pago y contacto
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="cbu">
                {(field) => (
                  <Campo
                    etiqueta="CBU"
                    ayuda="22 dígitos"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
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

              <form.Field name="aliasCbu">
                {(field) => (
                  <Campo etiqueta="Alias">
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

              <form.Field name="email">
                {(field) => (
                  <Campo
                    etiqueta="Email"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        type="email"
                        autoComplete="email"
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

              <form.Field name="telefono">
                {(field) => (
                  <Campo etiqueta="Teléfono">
                    {({ id, describedBy }) => (
                      <Entrada
                        id={id}
                        type="tel"
                        autoComplete="tel"
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
            <Link to="/proveedores" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  {esEdicion ? "Guardar cambios" : "Crear proveedor"}
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
