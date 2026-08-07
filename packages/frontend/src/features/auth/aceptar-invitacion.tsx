import {
  Boton,
  Campo,
  clasesBoton,
  Entrada,
  Esqueleto,
  Tarjeta,
  ToggleTema,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { authClient, ETIQUETA_ROL } from "../../lib/auth.js";
import { primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const schema = z
  .object({
    nombre: z.string().trim().min(1, "Ingresá tu nombre"),
    password: z.string().min(12, "Mínimo 12 caracteres"),
    repetir: z.string(),
  })
  .refine((v) => v.password === v.repetir, {
    message: "Las contraseñas no coinciden",
    path: ["repetir"],
  });

export function AceptarInvitacion({ invitacionId }: { invitacionId: string }) {
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);
  const [sumada, setSumada] = useState(false);

  const invitacion = useQuery({
    ...trpc.invitaciones.ver.queryOptions({ id: invitacionId }),
    retry: false,
  });

  const aceptar = useMutation(trpc.invitaciones.aceptar.mutationOptions());

  // Si el mail ya tiene cuenta no hay contraseña que definir: entra con la que
  // ya usa. Pedírsela igual y después ignorarla dejaba el ingreso fallando sin
  // explicación.
  const yaTieneCuenta = invitacion.data?.yaTieneCuenta ?? false;

  const sumarme = async () => {
    setError(null);
    try {
      await aceptar.mutateAsync({ id: invitacionId });
      setSumada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aceptar la invitación.");
    }
  };

  const form = useForm({
    defaultValues: { nombre: "", password: "", repetir: "" },
    validators: { onBlur: schema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        // El servidor valida la invitación y crea la cuenta; recién después
        // iniciamos sesión con esas credenciales.
        const { email } = await aceptar.mutateAsync({
          id: invitacionId,
          nombre: value.nombre.trim(),
          password: value.password,
        });
        const { error: falloLogin } = await authClient.signIn.email({
          email,
          password: value.password,
        });
        if (falloLogin) {
          setError("Tu cuenta se creó, pero no pudimos iniciar sesión. Probá desde el login.");
          return;
        }
        window.location.assign("/panel");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo aceptar la invitación.");
      }
    },
  });

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex justify-end p-4">
        <ToggleTema />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Aceptar invitación
            </h1>
            {invitacion.data && (
              <p className="mt-1 text-sm text-muted-foreground">
                Te invitaron a <span className="font-medium">{invitacion.data.organizacion}</span>
                {invitacion.data.rol && ETIQUETA_ROL[invitacion.data.rol]
                  ? ` como ${ETIQUETA_ROL[invitacion.data.rol]}`
                  : ""}
              </p>
            )}
          </div>

          <Tarjeta className="p-6">
            {invitacion.isPending ? (
              <div className="space-y-3" role="status" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Esqueleto key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : invitacion.isError ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-danger">{invitacion.error.message}</p>
                <Link to="/login" className={clasesBoton("secundario", "sm")}>
                  Ir al inicio de sesión
                </Link>
              </div>
            ) : sumada ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-foreground">
                  Listo, ya sos parte de{" "}
                  <span className="font-medium">{invitacion.data.organizacion}</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Ingresá con la contraseña que ya usás en ERP PyME.
                </p>
                <Link to="/login" className={clasesBoton()}>
                  Ir al inicio de sesión
                </Link>
              </div>
            ) : yaTieneCuenta ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ya tenés una cuenta con{" "}
                  <span className="font-medium text-foreground">{invitacion.data.email}</span>. Al
                  aceptar, esta empresa se suma a tu cuenta y vas a poder cambiar entre las dos
                  desde el selector de arriba. Tu contraseña no cambia.
                </p>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                  >
                    {error}
                  </p>
                )}

                <Boton
                  cargando={aceptar.isPending}
                  className="w-full justify-center"
                  onClick={() => void sumarme()}
                >
                  Sumarme a {invitacion.data.organizacion}
                </Boton>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void form.handleSubmit();
                }}
                className="space-y-4"
              >
                <Campo etiqueta="Email">
                  {({ id }) => <Entrada id={id} value={invitacion.data.email} readOnly disabled />}
                </Campo>

                <form.Field name="nombre">
                  {(field) => (
                    <Campo
                      etiqueta="Tu nombre"
                      requerido
                      error={
                        field.state.meta.isBlurred
                          ? primerError(field.state.meta.errors)
                          : undefined
                      }
                    >
                      {({ id, invalido }) => (
                        <Entrada
                          id={id}
                          autoComplete="name"
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
                      etiqueta="Contraseña"
                      requerido
                      ayuda="Al menos 12 caracteres"
                      error={
                        field.state.meta.isBlurred
                          ? primerError(field.state.meta.errors)
                          : undefined
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

                <form.Field name="repetir">
                  {(field) => (
                    <Campo
                      etiqueta="Repetir contraseña"
                      requerido
                      error={
                        field.state.meta.isBlurred
                          ? primerError(field.state.meta.errors)
                          : undefined
                      }
                    >
                      {({ id, invalido }) => (
                        <Entrada
                          id={id}
                          type="password"
                          autoComplete="new-password"
                          invalido={invalido}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </Campo>
                  )}
                </form.Field>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                  >
                    {error}
                  </p>
                )}

                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(enviando) => (
                    <Boton type="submit" cargando={enviando} className="w-full justify-center">
                      Crear cuenta y entrar
                    </Boton>
                  )}
                </form.Subscribe>
              </form>
            )}
          </Tarjeta>
        </div>
      </main>
    </div>
  );
}
