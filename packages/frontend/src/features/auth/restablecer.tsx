import { Boton, Campo, clasesBoton, Entrada, Tarjeta, ToggleTema } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "../../lib/auth.js";
import { primerError } from "../../lib/formulario.js";

const schema = z
  .object({
    password: z.string().min(12, "Mínimo 12 caracteres"),
    repetir: z.string(),
  })
  .refine((v) => v.password === v.repetir, {
    message: "Las contraseñas no coinciden",
    path: ["repetir"],
  });

/**
 * Elección de la contraseña nueva. El token llega en la query del link que
 * mandamos por mail; sin token no hay nada que hacer acá.
 */
export function Restablecer({ token }: { token: string | undefined }) {
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const form = useForm({
    defaultValues: { password: "", repetir: "" },
    validators: { onBlur: schema },
    onSubmit: async ({ value }) => {
      setError(null);
      if (!token) {
        return;
      }
      const { error: fallo } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });
      if (fallo) {
        // El caso normal es un link vencido o ya usado; se dice así, con la
        // salida a mano, en lugar de un código de error.
        setError(
          "No pudimos cambiar la contraseña. El link puede haber vencido o ya haber sido usado: pedí uno nuevo.",
        );
        return;
      }
      setListo(true);
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
              Nueva contraseña
            </h1>
          </div>

          <Tarjeta className="p-6">
            {!token ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-danger">
                  Este link no es válido. Volvé a pedir uno desde la pantalla de recuperación.
                </p>
                <Link to="/recuperar" className={clasesBoton("secundario", "sm")}>
                  Pedir un link nuevo
                </Link>
              </div>
            ) : listo ? (
              <div className="space-y-4 text-center">
                <CircleCheck className="mx-auto size-8 text-success" aria-hidden="true" />
                <p role="status" className="text-sm text-foreground">
                  Listo, tu contraseña quedó cambiada.
                </p>
                <Link to="/login" className={clasesBoton()}>
                  Ingresar
                </Link>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void form.handleSubmit();
                }}
                className="space-y-4"
              >
                <form.Field name="password">
                  {(field) => (
                    <Campo
                      etiqueta="Contraseña nueva"
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
                          autoFocus
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
                      Cambiar contraseña
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
