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

// Validación de UI. El servidor revalida todo con sus propios schemas Zod
// (incluida la verificación del dígito verificador del CUIT): esto es
// feedback temprano, no la última palabra.
const formularioSchema = z.object({
  razonSocial: z.string().trim().min(1, "La razón social es obligatoria"),
  // La misma función que valida el servidor: si acá se chequearan solo los 11
  // dígitos, un CUIT con verificador equivocado pasaría el formulario y lo
  // rechazaría el backend, con el error lejos del campo que lo causó.
  cuit: z
    .string()
    .trim()
    .refine((v) => v === "" || validarCuit(v), "CUIT inválido (revisá el dígito verificador)"),
  condicionIva: z.enum(["responsable_inscripto", "monotributo", "exento", "consumidor_final"]),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email inválido"),
  telefono: z.string().trim(),
  direccion: z.string().trim(),
  limiteCredito: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v),
      "Usá punto decimal, máximo 2 decimales",
    ),
  estado: z.enum(["activo", "inactivo", "en_mora"]),
});

type ValoresFormulario = z.infer<typeof formularioSchema>;

const VALORES_INICIALES: ValoresFormulario = {
  razonSocial: "",
  cuit: "",
  condicionIva: "responsable_inscripto",
  email: "",
  telefono: "",
  direccion: "",
  limiteCredito: "",
  estado: "activo",
};

const CONDICIONES_IVA = [
  { valor: "responsable_inscripto", etiqueta: "Responsable Inscripto" },
  { valor: "monotributo", etiqueta: "Monotributo" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "consumidor_final", etiqueta: "Consumidor Final" },
] as const;

const ESTADOS = [
  { valor: "activo", etiqueta: "Activo" },
  { valor: "inactivo", etiqueta: "Inactivo" },
  { valor: "en_mora", etiqueta: "En mora" },
] as const;

export function FormularioCliente({ clienteId }: { clienteId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esEdicion = Boolean(clienteId);

  const consulta = useQuery({
    ...trpc.clientes.obtener.queryOptions({ id: clienteId ?? "" }),
    enabled: esEdicion,
  });

  const crear = useMutation(trpc.clientes.crear.mutationOptions());
  const actualizar = useMutation(trpc.clientes.actualizar.mutationOptions());
  const mutacion = esEdicion ? actualizar : crear;

  const cliente = consulta.data;
  const form = useForm({
    defaultValues: cliente
      ? {
          razonSocial: cliente.razonSocial,
          cuit: cliente.cuit ?? "",
          condicionIva: cliente.condicionIva,
          email: cliente.email ?? "",
          telefono: cliente.telefono ?? "",
          direccion: cliente.direccion ?? "",
          limiteCredito: cliente.limiteCredito ?? "",
          estado: cliente.estado,
        }
      : VALORES_INICIALES,
    validators: { onBlur: formularioSchema },
    onSubmit: async ({ value }) => {
      const datos = {
        razonSocial: value.razonSocial.trim(),
        cuit: opcional(value.cuit),
        condicionIva: value.condicionIva,
        email: opcional(value.email),
        telefono: opcional(value.telefono),
        direccion: opcional(value.direccion),
        limiteCredito: opcional(value.limiteCredito),
      };
      if (clienteId) {
        await actualizar.mutateAsync({ id: clienteId, datos: { ...datos, estado: value.estado } });
      } else {
        await crear.mutateAsync(datos);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.clientes.pathKey() });
      await navigate({ to: "/clientes" });
    },
  });

  if (esEdicion && consulta.isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Editar cliente" />
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
        to="/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a clientes
      </Link>

      <EncabezadoPagina
        titulo={esEdicion ? "Editar cliente" : "Nuevo cliente"}
        descripcion={
          esEdicion
            ? "Modificá los datos del cliente. Los cambios quedan registrados en auditoría."
            : "Los datos fiscales determinan qué tipo de comprobante se le puede emitir."
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
              Contacto
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
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

            <form.Field name="direccion">
              {(field) => (
                <Campo etiqueta="Dirección">
                  {({ id, describedBy }) => (
                    <Entrada
                      id={id}
                      autoComplete="street-address"
                      aria-describedby={describedBy}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </Campo>
              )}
            </form.Field>
          </fieldset>

          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Condiciones comerciales
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="limiteCredito">
                {(field) => (
                  <Campo
                    etiqueta="Límite de crédito"
                    ayuda="En pesos. Se usa para alertar sobregiros."
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

              {esEdicion && (
                <form.Field name="estado">
                  {(field) => (
                    <Campo etiqueta="Estado">
                      {({ id, describedBy }) => (
                        <Selector
                          id={id}
                          aria-describedby={describedBy}
                          value={field.state.value}
                          onChange={(e) =>
                            field.handleChange(e.target.value as ValoresFormulario["estado"])
                          }
                          onBlur={field.handleBlur}
                        >
                          {ESTADOS.map((o) => (
                            <option key={o.valor} value={o.valor}>
                              {o.etiqueta}
                            </option>
                          ))}
                        </Selector>
                      )}
                    </Campo>
                  )}
                </form.Field>
              )}
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
            <Link to="/clientes" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  {esEdicion ? "Guardar cambios" : "Crear cliente"}
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
