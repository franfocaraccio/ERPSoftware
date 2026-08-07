import {
  Boton,
  Campo,
  Casilla,
  DialogoConfirmacion,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EncabezadoPagina } from "../../components/layout.js";
import { BotonCopiarLink, LinkInvitacion } from "../../components/link-invitacion.js";
import { ETIQUETA_ROL } from "../../lib/auth.js";
import { formatearFecha } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const ROLES = ["administrador", "escritura_lectura", "solo_lectura"] as const;

/** Qué puede hacer cada rol, en una línea, para no tener que adivinarlo. */
const DESCRIPCION_ROL: Record<(typeof ROLES)[number], string> = {
  administrador: "Acceso total, incluida la gestión del equipo",
  escritura_lectura: "Carga y edita datos; no gestiona usuarios",
  solo_lectura: "Consulta todo, no modifica nada",
};

const invitarSchema = z.object({
  email: z.email("Ingresá un email válido"),
  rol: z.enum(ROLES),
});

function FormularioInvitacion({
  onListo,
}: {
  /** Recibe la invitación recién creada, o null si se canceló el formulario. */
  onListo: (invitada: { email: string; link: string } | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invitar = useMutation(trpc.equipo.invitar.mutationOptions());
  const [verPanel, setVerPanel] = useState(true);

  const form = useForm({
    defaultValues: { email: "", rol: "escritura_lectura" as (typeof ROLES)[number] },
    validators: { onBlur: invitarSchema },
    onSubmit: async ({ value }) => {
      const creada = await invitar.mutateAsync({
        email: value.email.trim(),
        rol: value.rol,
        verPanel,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.equipo.pathKey() });
      onListo({ email: creada.email, link: creada.link });
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
        <p className="text-sm text-muted-foreground">
          Le llega un mail con un link para crear su cuenta. No se registra solo.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="email">
            {(field) => (
              <Campo
                etiqueta="Email"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <Entrada
                    id={id}
                    type="email"
                    autoComplete="off"
                    placeholder="nombre@empresa.com.ar"
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

          <form.Field name="rol">
            {(field) => (
              <Campo etiqueta="Rol" requerido ayuda={DESCRIPCION_ROL[field.state.value]}>
                {({ id, describedBy }) => (
                  <Selector
                    id={id}
                    aria-describedby={describedBy}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as (typeof ROLES)[number])}
                  >
                    {ROLES.map((rol) => (
                      <option key={rol} value={rol}>
                        {ETIQUETA_ROL[rol]}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>
        </div>

        <Casilla
          etiqueta="Puede ver el panel de indicadores"
          ayuda="El panel muestra márgenes, liquidez, saldos y la proyección de caja. Destildalo si no corresponde que los vea."
          checked={verPanel}
          onChange={(e) => setVerPanel(e.target.checked)}
        />

        {invitar.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo invitar: {invitar.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="secundario" tamano="sm" onClick={() => onListo(null)}>
            Cancelar
          </Boton>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => (
              <Boton type="submit" tamano="sm" cargando={enviando}>
                Enviar invitación
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

function Miembros() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(trpc.equipo.listar.queryOptions());
  const cambiarAcceso = useMutation(trpc.equipo.cambiarAccesoPanel.mutationOptions());
  const cambiarRol = useMutation(trpc.equipo.cambiarRol.mutationOptions());
  const quitar = useMutation(trpc.equipo.quitarMiembro.mutationOptions());
  const cancelar = useMutation(trpc.equipo.cancelarInvitacion.mutationOptions());
  const [aCancelar, setACancelar] = useState<{ id: string; email: string } | null>(null);
  const [aQuitar, setAQuitar] = useState<{ usuarioId: string; nombre: string } | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: trpc.equipo.pathKey() });

  if (isError) {
    return (
      <Tarjeta>
        <EstadoVacio
          titulo="No se pudo cargar el equipo"
          accion={
            <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
              Reintentar
            </Boton>
          }
        />
      </Tarjeta>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-2" role="status" aria-busy="true" aria-label="Cargando equipo">
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorAccion && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {errorAccion}
        </p>
      )}

      <Tarjeta className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Miembros del equipo</caption>
            <thead>
              <tr className="border-b border-border">
                {["Persona", "Rol", "Panel", "Desde", ""].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.miembros.map((m) => (
                <tr key={m.usuarioId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {m.nombre}
                      {m.esUnoMismo && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (vos)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {m.esUnoMismo ? (
                      // El propio rol no se edita acá: quien lo cambia se queda
                      // sin la pantalla y sin forma de volver.
                      <span className="text-muted-foreground">{ETIQUETA_ROL[m.rol]}</span>
                    ) : (
                      <Selector
                        aria-label={`Rol de ${m.nombre}`}
                        value={m.rol}
                        disabled={cambiarRol.isPending}
                        onChange={async (e) => {
                          setErrorAccion(null);
                          try {
                            await cambiarRol.mutateAsync({
                              usuarioId: m.usuarioId,
                              rol: e.target.value as (typeof ROLES)[number],
                            });
                            await refrescar();
                          } catch (error) {
                            setErrorAccion(
                              error instanceof Error ? error.message : "No se pudo cambiar el rol.",
                            );
                          }
                        }}
                      >
                        {ROLES.map((rol) => (
                          <option key={rol} value={rol}>
                            {ETIQUETA_ROL[rol]}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Casilla
                      etiqueta={m.verPanel ? "Habilitado" : "Sin acceso"}
                      checked={m.verPanel}
                      // Quitarse el panel a uno mismo deja la pantalla vacía sin
                      // forma obvia de volver: se bloquea.
                      disabled={m.esUnoMismo || cambiarAcceso.isPending}
                      onChange={async (e) => {
                        await cambiarAcceso.mutateAsync({
                          usuarioId: m.usuarioId,
                          verPanel: e.target.checked,
                        });
                        await refrescar();
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular">
                    {formatearFecha(m.desde)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!m.esUnoMismo && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`Quitar a ${m.nombre} del equipo`}
                        onClick={() => setAQuitar({ usuarioId: m.usuarioId, nombre: m.nombre })}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Quitar
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {data.invitaciones.length > 0 && (
        <section aria-labelledby="pendientes">
          <h2
            id="pendientes"
            className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
            Invitaciones pendientes
          </h2>
          <Tarjeta className="divide-y divide-border">
            {data.invitaciones.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ETIQUETA_ROL[inv.rol]}
                    {!inv.verPanel && " · sin panel"} · vence {formatearFecha(inv.expira)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <BotonCopiarLink link={inv.link} />
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => setACancelar({ id: inv.id, email: inv.email })}
                  >
                    Cancelar
                  </Boton>
                </div>
              </div>
            ))}
          </Tarjeta>
        </section>
      )}

      <DialogoConfirmacion
        abierto={aQuitar !== null}
        onAbiertoChange={(abierto) => !abierto && setAQuitar(null)}
        titulo="Sacar del equipo"
        descripcion={`${aQuitar?.nombre ?? ""} pierde el acceso a esta empresa. Los datos que cargó quedan como están.`}
        textoConfirmar="Sacar del equipo"
        destructivo
        cargando={quitar.isPending}
        onConfirmar={async () => {
          if (aQuitar) {
            setErrorAccion(null);
            try {
              await quitar.mutateAsync({ usuarioId: aQuitar.usuarioId });
              await refrescar();
            } catch (error) {
              setErrorAccion(
                error instanceof Error ? error.message : "No se pudo sacar a esa persona.",
              );
            }
          }
          setAQuitar(null);
        }}
      />

      <DialogoConfirmacion
        abierto={aCancelar !== null}
        onAbiertoChange={(abierto) => !abierto && setACancelar(null)}
        titulo="Cancelar la invitación"
        descripcion={`${aCancelar?.email ?? ""} no va a poder usar el link que le mandamos.`}
        textoConfirmar="Cancelar invitación"
        destructivo
        cargando={cancelar.isPending}
        onConfirmar={async () => {
          if (aCancelar) {
            await cancelar.mutateAsync({ invitacionId: aCancelar.id });
            await refrescar();
          }
          setACancelar(null);
        }}
      />
    </div>
  );
}

export function Equipo() {
  const [invitando, setInvitando] = useState(false);
  const [reciente, setReciente] = useState<{ email: string; link: string } | null>(null);

  return (
    <>
      <EncabezadoPagina
        titulo="Equipo"
        descripcion="Quién entra a la empresa, con qué rol y qué ve."
        acciones={
          !invitando && (
            <Boton
              tamano="sm"
              onClick={() => {
                setReciente(null);
                setInvitando(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Invitar
            </Boton>
          )
        }
      />

      {invitando && (
        <FormularioInvitacion
          onListo={(invitada) => {
            setInvitando(false);
            setReciente(invitada);
          }}
        />
      )}

      {reciente && (
        <div className="mb-4">
          <LinkInvitacion link={reciente.link} email={reciente.email} />
        </div>
      )}

      <Miembros />
    </>
  );
}

/** Estado para quien entra a /equipo sin ser Administrador. */
export function EquipoSinPermiso() {
  return (
    <>
      <EncabezadoPagina titulo="Equipo" />
      <Tarjeta>
        <EstadoVacio
          icono={<Users className="size-8" aria-hidden="true" />}
          titulo="Esta sección es del Administrador"
          descripcion="Solo quien administra la empresa puede invitar gente y cambiar permisos."
        />
      </Tarjeta>
    </>
  );
}
