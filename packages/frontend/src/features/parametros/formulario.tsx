import { Boton, Campo, Entrada, Esqueleto, EstadoVacio, Tarjeta } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { EncabezadoPagina } from "../../components/layout.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Los decimales se editan como texto y se mandan como texto: son `numeric` en
 * la base y `Money` en el dominio. Pasarlos por `number` acá reintroduce el
 * error de punto flotante que el resto del sistema evita.
 */
const decimal = /^\d+([.,]\d{1,2})?$/;

const schema = z.object({
  umbralMoraDias: z
    .string()
    .regex(/^\d+$/, "Tiene que ser un número entero de días")
    .refine((v) => Number(v) >= 1 && Number(v) <= 365, "Entre 1 y 365 días"),
  margenObjetivo: z
    .string()
    .refine((v) => v === "" || decimal.test(v), "Usá números, con hasta dos decimales")
    .refine((v) => v === "" || Number(v.replace(",", ".")) <= 100, "No puede superar 100%"),
  minimoOperativo: z
    .string()
    .refine((v) => v === "" || decimal.test(v), "Usá números, con hasta dos decimales"),
});

/** La coma es lo natural al escribir en castellano; el borde espera punto. */
function aDecimal(valor: string): string | null {
  const limpio = valor.trim().replace(",", ".");
  return limpio === "" ? null : limpio;
}

export function Parametros() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(trpc.parametros.obtener.queryOptions());
  const guardar = useMutation(trpc.parametros.guardar.mutationOptions());
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!guardado) {
      return;
    }
    const id = setTimeout(() => setGuardado(false), 4000);
    return () => clearTimeout(id);
  }, [guardado]);

  const form = useForm({
    defaultValues: {
      umbralMoraDias: String(data?.umbralMoraDias ?? 60),
      margenObjetivo: data?.margenObjetivo ?? "",
      minimoOperativo: data?.minimoOperativo ?? "",
    },
    validators: { onBlur: schema },
    onSubmit: async ({ value }) => {
      await guardar.mutateAsync({
        umbralMoraDias: Number(value.umbralMoraDias),
        margenObjetivo: aDecimal(value.margenObjetivo),
        minimoOperativo: aDecimal(value.minimoOperativo),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.parametros.pathKey() });
      // El panel se lee con estos umbrales: sus semáforos cambian con esto.
      await queryClient.invalidateQueries({ queryKey: trpc.financiero.pathKey() });
      setGuardado(true);
    },
  });

  if (isError) {
    return (
      <>
        <EncabezadoPagina titulo="Parámetros" />
        <Tarjeta>
          <EstadoVacio
            titulo="No se pudieron cargar los parámetros"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        </Tarjeta>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Parámetros" />
        <Esqueleto className="h-80 w-full max-w-2xl" />
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Parámetros"
        descripcion="Los umbrales con los que el panel decide qué está en rango y qué no."
      />

      <Tarjeta className="max-w-2xl p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-5"
        >
          <form.Field name="umbralMoraDias">
            {(field) => (
              <Campo
                etiqueta="Umbral de mora"
                requerido
                ayuda="Días de cobro promedio a partir de los cuales el indicador pasa a rojo. Si cobrás a 30 días, un umbral de 45 te avisa cuando se está estirando."
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <div className="flex items-center gap-2">
                    <Entrada
                      id={id}
                      inputMode="numeric"
                      className="max-w-32"
                      aria-describedby={describedBy}
                      invalido={invalido}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <span className="text-sm text-muted-foreground">días</span>
                  </div>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="margenObjetivo">
            {(field) => (
              <Campo
                etiqueta="Margen bruto objetivo"
                ayuda="El margen al que apuntás. Dejalo vacío si no querés que el panel compare contra ningún objetivo."
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <div className="flex items-center gap-2">
                    <Entrada
                      id={id}
                      inputMode="decimal"
                      placeholder="35"
                      className="max-w-32"
                      aria-describedby={describedBy}
                      invalido={invalido}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="minimoOperativo">
            {(field) => (
              <Campo
                etiqueta="Mínimo operativo"
                ayuda="El piso de caja con el que dormís tranquilo. Es la línea punteada de la proyección: las semanas que caen por debajo se marcan en rojo. Vacío = sin línea."
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Entrada
                      id={id}
                      inputMode="decimal"
                      placeholder="800000"
                      className="max-w-48"
                      aria-describedby={describedBy}
                      invalido={invalido}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </Campo>
            )}
          </form.Field>

          {guardar.isError && (
            <p role="alert" className="text-sm text-danger">
              No se pudo guardar: {guardar.error.message}
            </p>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  Guardar
                </Boton>
              )}
            </form.Subscribe>
            {guardado && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-success">
                <CircleCheck className="size-4" aria-hidden="true" />
                Guardado. El panel ya usa estos valores.
              </p>
            )}
          </div>
        </form>
      </Tarjeta>
    </>
  );
}

/** Para quien entra por URL sin ser Administrador. */
export function ParametrosSinPermiso() {
  return (
    <>
      <EncabezadoPagina titulo="Parámetros" />
      <Tarjeta>
        <EstadoVacio
          icono={<SlidersHorizontal className="size-8" aria-hidden="true" />}
          titulo="Esta sección es del Administrador"
          descripcion="Los umbrales con los que se mide la empresa los configura quien la administra."
        />
      </Tarjeta>
    </>
  );
}
