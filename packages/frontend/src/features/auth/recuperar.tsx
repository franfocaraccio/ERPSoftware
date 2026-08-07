import { Boton, Campo, clasesBoton, Entrada, Tarjeta, ToggleTema } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "../../lib/auth.js";
import { primerError } from "../../lib/formulario.js";

const schema = z.object({ email: z.email("Ingresá un email válido") });

/**
 * Pedido de recuperación de contraseña.
 *
 * El resultado es siempre el mismo, exista o no la cuenta: si dijéramos
 * "ese mail no está registrado", cualquiera podría averiguar quién tiene
 * cuenta probando direcciones.
 */
export function Recuperar() {
  const [enviado, setEnviado] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onBlur: schema },
    onSubmit: async ({ value }) => {
      await authClient.requestPasswordReset({
        email: value.email.trim(),
        redirectTo: `${window.location.origin}/restablecer`,
      });
      setEnviado(true);
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
              Recuperar contraseña
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Te mandamos un link para elegir una nueva.
            </p>
          </div>

          <Tarjeta className="p-6">
            {enviado ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto size-8 text-success" aria-hidden="true" />
                <p role="status" className="text-sm text-foreground">
                  Si hay una cuenta con ese email, ya le mandamos el link para restablecer la
                  contraseña.
                </p>
                <p className="text-xs text-muted-foreground">
                  Revisá también el correo no deseado. El link vence en una hora.
                </p>
                <Link to="/login" className={clasesBoton("secundario", "sm")}>
                  Volver al inicio de sesión
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
                <form.Field name="email">
                  {(field) => (
                    <Campo
                      etiqueta="Email"
                      requerido
                      error={
                        field.state.meta.isBlurred
                          ? primerError(field.state.meta.errors)
                          : undefined
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

                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(enviando) => (
                    <Boton type="submit" cargando={enviando} className="w-full justify-center">
                      Enviarme el link
                    </Boton>
                  )}
                </form.Subscribe>

                <div className="text-center">
                  <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                    Volver al inicio de sesión
                  </Link>
                </div>
              </form>
            )}
          </Tarjeta>
        </div>
      </main>
    </div>
  );
}
