import {
  Boton,
  Campo,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ScrollText } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { opcional, primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const ESTADOS = [
  { valor: "en_cartera", etiqueta: "En cartera" },
  { valor: "depositado", etiqueta: "Depositado" },
  { valor: "acreditado", etiqueta: "Acreditado" },
  { valor: "rechazado", etiqueta: "Rechazado" },
  { valor: "endosado", etiqueta: "Endosado" },
] as const;

const TONO_ESTADO = {
  en_cartera: "info",
  depositado: "neutro",
  acreditado: "exito",
  rechazado: "peligro",
  endosado: "neutro",
} as const;

const ETIQUETA_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.etiqueta])) as Record<
  string,
  string
>;

const chequeSchema = z.object({
  numero: z.string().trim().min(1, "El número es obligatorio"),
  librador: z.string(),
  libradorNombre: z.string().trim(),
  banco: z.string().trim(),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  importe: z
    .string()
    .trim()
    .refine(
      (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0,
      "Importe mayor a cero, con punto decimal",
    ),
  estado: z.enum(["en_cartera", "depositado", "acreditado", "rechazado", "endosado"]),
});

type ValoresCheque = z.infer<typeof chequeSchema>;

function FormularioCheque({ onListo }: { onListo: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.tesoreria.cheques.crear.mutationOptions());
  const clientes = useQuery(trpc.clientes.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }));

  const form = useForm({
    defaultValues: {
      numero: "",
      librador: "",
      libradorNombre: "",
      banco: "",
      fechaPago: "",
      importe: "",
      estado: "en_cartera",
    } as ValoresCheque,
    validators: { onBlur: chequeSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        numero: value.numero.trim(),
        libradorClienteId: value.librador || null,
        // El backend exige uno de los dos: cliente vinculado o nombre libre.
        libradorNombre: value.librador ? undefined : opcional(value.libradorNombre),
        banco: opcional(value.banco),
        fechaPago: value.fechaPago,
        importe: value.importe.trim(),
        estado: value.estado,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.tesoreria.pathKey() });
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
          <form.Field name="numero">
            {(field) => (
              <Campo
                etiqueta="Número de cheque"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Entrada
                    id={id}
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

          <form.Field name="banco">
            {(field) => (
              <Campo etiqueta="Banco">
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

          <form.Field name="importe">
            {(field) => (
              <Campo
                etiqueta="Importe"
                requerido
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

          <form.Field name="librador">
            {(field) => (
              <Campo etiqueta="Librador (cliente)">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="">Cheque de un tercero</option>
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

          {/* Si no se eligió un cliente, hace falta el nombre del tercero. */}
          <form.Subscribe selector={(s) => s.values.librador}>
            {(librador) =>
              librador ? null : (
                <form.Field name="libradorNombre">
                  {(field) => (
                    <Campo etiqueta="Nombre del librador" requerido>
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
              )
            }
          </form.Subscribe>

          <form.Field name="fechaPago">
            {(field) => (
              <Campo
                etiqueta="Fecha de pago"
                requerido
                ayuda="Cuándo es cobrable"
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

          <form.Field name="estado">
            {(field) => (
              <Campo etiqueta="Estado">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as ValoresCheque["estado"])}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.valor} value={e.valor}>
                        {e.etiqueta}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>
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
                Registrar cheque
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

/** Los días para cobro se muestran con su urgencia, no solo el número. */
function TextoDias({ dias, estado }: { dias: number; estado: string }) {
  if (estado !== "en_cartera") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (dias < 0) {
    return <span className="font-medium text-danger">Vencido hace {Math.abs(dias)} d</span>;
  }
  if (dias === 0) {
    return <span className="font-medium text-warning">Hoy</span>;
  }
  return (
    <span className={dias <= 7 ? "font-medium text-warning" : "text-muted-foreground"}>
      En {dias} {dias === 1 ? "día" : "días"}
    </span>
  );
}

export function Cheques() {
  const trpc = useTRPC();
  const [creando, setCreando] = useState(false);
  const [estado, setEstado] = useState<ValoresCheque["estado"] | "">("");

  const { data, isPending, isError, refetch } = useQuery(
    trpc.tesoreria.cheques.listar.queryOptions({
      estado: estado || undefined,
      pagina: 1,
      tamanoPagina: 100,
    }),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as ValoresCheque["estado"] | "")}
          aria-label="Filtrar por estado"
          className="h-10 cursor-pointer rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-ring"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>

        {!isPending && data && (
          <p className="text-xs text-muted-foreground">
            <span className="tabular">{data.total}</span> {data.total === 1 ? "cheque" : "cheques"}{" "}
            · En cartera{" "}
            <span className="font-medium tabular text-foreground">
              {formatearImporte(data.totalEnCartera)}
            </span>
          </p>
        )}

        {!creando && (
          <Boton tamano="sm" className="ml-auto" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo cheque
          </Boton>
        )}
      </div>

      {creando && <FormularioCheque onListo={() => setCreando(false)} />}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar los cheques"
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
            icono={<ScrollText className="size-8" aria-hidden="true" />}
            titulo={estado ? "Sin cheques en ese estado" : "Todavía no hay cheques"}
            descripcion="Los cheques en cartera alimentan la proyección de cobros."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Número", "Librador", "Banco", "Fecha de pago", "Cobro", "Estado"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td className="px-4 py-3 tabular font-medium text-foreground">{c.numero}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.libradorNombreEfectivo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.banco ?? "—"}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {formatearFecha(c.fechaPago)}
                    </td>
                    <td className="px-4 py-3">
                      <TextoDias dias={c.diasParaCobro} estado={c.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <Insignia tono={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Insignia>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular text-foreground">
                      {formatearImporte(c.importe)}
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
