import { Boton, Campo, Entrada, Tarjeta, ToggleTema } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "../../lib/auth.js";
import { primerError } from "../../lib/formulario.js";

const loginSchema = z.object({
  email: z.email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export function Login() {
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onBlur: loginSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: fallo } = await authClient.signIn.email({
        email: value.email.trim(),
        password: value.password,
      });
      if (fallo) {
        // Mensaje genérico: no revelamos si el mail existe o no.
        setError("Email o contraseña incorrectos.");
        return;
      }
      // Carga completa en vez de navegación cliente: así el store de sesión
      // arranca con la cookie ya puesta y el guardia no rebota al login.
      window.location.assign("/");
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
            <h1 className="text-xl font-semibold tracking-tight text-foreground">ERP PyME</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá para continuar</p>
          </div>

          <Tarjeta className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
              className="space-y-4"
            >
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
                        autoComplete="email"
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

              <form.Field name="password">
                {(field) => (
                  <Campo
                    etiqueta="Contraseña"
                    requerido
                    error={
                      field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                    }
                  >
                    {({ id, describedBy, invalido }) => (
                      <Entrada
                        id={id}
                        type="password"
                        autoComplete="current-password"
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
                    Ingresar
                  </Boton>
                )}
              </form.Subscribe>
            </form>
          </Tarjeta>

          {/* Sin link de "crear cuenta": el alta es solo por invitación. */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            El acceso se otorga por invitación. Si no tenés cuenta, pedile una al dueño de tu
            empresa.
          </p>
        </div>
      </main>
    </div>
  );
}
