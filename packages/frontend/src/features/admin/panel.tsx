import {
  Boton,
  Campo,
  clasesBoton,
  cn,
  DialogoConfirmacion,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Tarjeta,
  ToggleTema,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { BotonCopiarLink, LinkInvitacion } from "../../components/link-invitacion.js";
import { MenuUsuario } from "../../components/sesion.js";
import { useSession } from "../../lib/auth.js";
import { formatearFecha } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const VISTAS = [
  { id: "organizaciones", etiqueta: "Organizaciones" },
  { id: "invitaciones", etiqueta: "Invitaciones" },
  { id: "admins", etiqueta: "Administradores" },
] as const;

type Vista = (typeof VISTAS)[number]["id"];

// --- Organizaciones ---

const orgSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  emailAdministrador: z.email("Email inválido"),
});

function FormularioOrganizacion({
  onListo,
}: {
  /** Recibe la invitación recién creada, o null si se canceló el formulario. */
  onListo: (creada: { email: string; link: string } | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.plataforma.crearOrganizacion.mutationOptions());

  const form = useForm({
    defaultValues: { nombre: "", emailAdministrador: "" },
    validators: { onBlur: orgSchema },
    onSubmit: async ({ value }) => {
      const email = value.emailAdministrador.trim();
      const creada = await crear.mutateAsync({
        nombre: value.nombre.trim(),
        emailAdministrador: email,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.plataforma.pathKey() });
      onListo({ email, link: creada.link });
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
          Se crea la empresa y se le envía la invitación a su administrador en un solo paso.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="nombre">
            {(field) => (
              <Campo
                etiqueta="Nombre de la empresa"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Entrada
                    id={id}
                    placeholder="Distribuidora del Plata SA"
                    invalido={invalido}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="emailAdministrador">
            {(field) => (
              <Campo
                etiqueta="Email del administrador"
                requerido
                ayuda="Le llega la invitación para crear su cuenta"
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, describedBy, invalido }) => (
                  <Entrada
                    id={id}
                    type="email"
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

        {crear.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo crear: {crear.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="secundario" tamano="sm" onClick={() => onListo(null)}>
            Cancelar
          </Boton>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => (
              <Boton type="submit" tamano="sm" cargando={enviando}>
                Crear e invitar
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

function Organizaciones() {
  const trpc = useTRPC();
  const [creando, setCreando] = useState(false);
  const [reciente, setReciente] = useState<{ email: string; link: string } | null>(null);
  const { data, isPending, isError, refetch } = useQuery(
    trpc.plataforma.organizaciones.queryOptions(),
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        {!isPending && data && (
          <p className="text-xs text-muted-foreground tabular">
            {data.length} {data.length === 1 ? "empresa" : "empresas"}
          </p>
        )}
        {!creando && (
          <Boton
            tamano="sm"
            className="ml-auto"
            onClick={() => {
              setReciente(null);
              setCreando(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva empresa
          </Boton>
        )}
      </div>

      {creando && (
        <FormularioOrganizacion
          onListo={(creada) => {
            setCreando(false);
            setReciente(creada);
          }}
        />
      )}

      {reciente && (
        <div className="mb-4">
          <LinkInvitacion link={reciente.link} email={reciente.email} />
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar las empresas"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        ) : isPending ? (
          <div className="space-y-2 p-4" role="status" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EstadoVacio
            icono={<Building2 className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay empresas"
            descripcion="Creá la primera y se le envía la invitación a su administrador."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Empresa", "Administrador", "Miembros", "Invitaciones", "Creada"].map((h) => (
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
                {data.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{org.nombre}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {org.administradorEmail ?? (
                        <Insignia tono="advertencia">Sin administrador todavía</Insignia>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{org.miembros}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {org.invitacionesPendientes > 0 ? (
                        <Insignia tono="info">{org.invitacionesPendientes} pendiente(s)</Insignia>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {formatearFecha(String(org.creada).slice(0, 10))}
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

// --- Invitaciones ---

function Invitaciones() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.plataforma.invitacionesPendientes.queryOptions());
  const cancelar = useMutation({
    ...trpc.plataforma.cancelarInvitacion.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.plataforma.pathKey() }),
  });

  if (isPending) {
    return (
      <Tarjeta className="space-y-2 p-4">
        {[0, 1].map((i) => (
          <Esqueleto key={i} className="h-11 w-full" />
        ))}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="overflow-hidden">
      {data && data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Email", "Empresa", "Rol", "Vence", ""].map((h, i) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: encabezados fijos
                    key={i}
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{inv.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.organizacion}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.rol ?? "—"}</td>
                  <td className="px-4 py-3 tabular text-muted-foreground">
                    {formatearFecha(String(inv.expira).slice(0, 10))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <BotonCopiarLink link={inv.link} />
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        cargando={cancelar.isPending && cancelar.variables?.invitacionId === inv.id}
                        onClick={() => cancelar.mutate({ invitacionId: inv.id })}
                      >
                        Cancelar
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EstadoVacio
          icono={<Mail className="size-8" aria-hidden="true" />}
          titulo="No hay invitaciones pendientes"
          descripcion="Las invitaciones se envían al crear una empresa."
        />
      )}
    </Tarjeta>
  );
}

// --- Administradores ---

const adminSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  email: z.email("Email inválido"),
  password: z.string().min(12, "Mínimo 12 caracteres"),
});

function Admins() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const [creando, setCreando] = useState(false);
  const [aQuitar, setAQuitar] = useState<{ id: string; email: string } | null>(null);

  const { data, isPending } = useQuery(trpc.plataforma.admins.queryOptions());
  const crear = useMutation(trpc.plataforma.crearAdmin.mutationOptions());
  const quitar = useMutation({
    ...trpc.plataforma.quitarAdmin.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.plataforma.pathKey() });
      setAQuitar(null);
    },
  });

  const form = useForm({
    defaultValues: { nombre: "", email: "", password: "" },
    validators: { onBlur: adminSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        nombre: value.nombre.trim(),
        email: value.email.trim(),
        password: value.password,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.plataforma.pathKey() });
      setCreando(false);
    },
  });

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Los administradores gestionan empresas e invitaciones. No acceden a los datos de las
          PyMEs.
        </p>
        {!creando && (
          <Boton tamano="sm" className="ml-auto shrink-0" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo admin
          </Boton>
        )}
      </div>

      {creando && (
        <Tarjeta className="mb-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <form.Field name="nombre">
                {(field) => (
                  <Campo
                    etiqueta="Nombre"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Entrada
                        id={id}
                        invalido={invalido}
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
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, invalido }) => (
                      <Entrada
                        id={id}
                        type="email"
                        invalido={invalido}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="password">
                {(field) => (
                  <Campo
                    etiqueta="Contraseña inicial"
                    requerido
                    ayuda="Al menos 12 caracteres"
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        type="password"
                        autoComplete="new-password"
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

            {crear.isError && (
              <p role="alert" className="text-sm text-danger">
                No se pudo crear: {crear.error.message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Boton variante="secundario" tamano="sm" onClick={() => setCreando(false)}>
                Cancelar
              </Boton>
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(enviando) => (
                  <Boton type="submit" tamano="sm" cargando={enviando}>
                    Crear admin
                  </Boton>
                )}
              </form.Subscribe>
            </div>
          </form>
        </Tarjeta>
      )}

      <Tarjeta className="overflow-hidden">
        {isPending ? (
          <div className="space-y-2 p-4" role="status" aria-busy="true">
            {[0, 1].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Nombre", "Email", "Desde", ""].map((h, i) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: encabezados fijos
                    key={i}
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((a) => {
                const soyYo = a.id === sesion?.user.id;
                return (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {a.nombre}
                      {soyYo && <span className="ml-2 text-xs text-muted-foreground">(vos)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {formatearFecha(String(a.creado).slice(0, 10))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!soyYo && (
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => setAQuitar({ id: a.id, email: a.email })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Quitar
                        </Boton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <DialogoConfirmacion
        abierto={aQuitar !== null}
        onAbiertoChange={(v) => !v && setAQuitar(null)}
        titulo="Quitar permisos de administrador"
        descripcion={
          <>
            <span className="font-medium">{aQuitar?.email}</span> va a dejar de acceder al panel de
            plataforma. La cuenta no se elimina.
          </>
        }
        textoConfirmar="Quitar permisos"
        destructivo
        cargando={quitar.isPending}
        onConfirmar={() => aQuitar && quitar.mutate({ usuarioId: aQuitar.id })}
      />
    </>
  );
}

// --- Panel ---

export function PanelAdmin() {
  const [vista, setVista] = useState<Vista>("organizaciones");
  const { data: sesion, isPending } = useSession();

  // Guard de navegación; el backend igual rechaza a cualquier no-admin.
  if (!isPending && sesion && sesion.user.role !== "admin") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <Tarjeta className="max-w-sm p-6 text-center">
          <p className="font-medium text-foreground">Esta sección es de la plataforma</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu cuenta no tiene permisos de administrador.
          </p>
          <Link to="/panel" className={cn("mt-4 inline-block", clasesBoton("secundario", "sm"))}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al ERP
          </Link>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Layout propio: sin el sidebar de módulos, para que quede claro que
          es otro espacio y no una sección más del ERP. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Plataforma</span>
          </div>
          {/* Sin botón "Ir al ERP": el admin no pertenece a ninguna empresa,
              así que allá no tendría nada que ver. */}
          <div className="flex items-center gap-2">
            <ToggleTema />
            <MenuUsuario />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Administración de plataforma
          </h1>
          <p className="text-sm text-muted-foreground">
            Alta de empresas, invitaciones y administradores.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Secciones de plataforma"
          className="mb-5 flex gap-1 border-b border-border"
        >
          {VISTAS.map(({ id, etiqueta }) => {
            const activa = vista === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={activa}
                aria-controls={`panel-${id}`}
                onClick={() => setVista(id)}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
                  activa
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {etiqueta}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`panel-${vista}`} aria-labelledby={`tab-${vista}`}>
          {vista === "organizaciones" && <Organizaciones />}
          {vista === "invitaciones" && <Invitaciones />}
          {vista === "admins" && <Admins />}
        </div>
      </main>
    </div>
  );
}
