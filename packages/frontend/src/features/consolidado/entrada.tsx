import { Boton, clasesBoton, Esqueleto, Tarjeta, ToggleTema } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useEffect } from "react";
import { borrarAcceso, guardarAcceso } from "../../lib/acceso-consolidado.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Canje del link de solo lectura.
 *
 * No entra solo: muestra de qué empresa se trata y hasta cuándo sirve, y
 * espera un clic. Entrar de una a los datos de una empresa por abrir un link
 * que te reenviaron es peor experiencia y peor idea.
 */
export function EntradaConsolidado({ tenantId, token }: { tenantId: string; token: string }) {
  const trpc = useTRPC();
  const { data, isPending, isError, error } = useQuery({
    ...trpc.consolidado.abrir.queryOptions({ tenantId, token }),
    retry: false,
  });

  // Si el link ya no sirve, tampoco sirve lo que la pestaña tenga guardado:
  // acá es donde se confirma que murió y se limpia.
  useEffect(() => {
    if (isError) {
      borrarAcceso();
    }
  }, [isError]);

  const entrar = () => {
    guardarAcceso({ tenantId, token });
    // Carga completa: el cliente tRPC toma el token del storage al armar cada
    // request, así que conviene arrancar de cero con el acceso ya guardado.
    window.location.assign("/panel");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex justify-end p-4">
        <ToggleTema />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <Tarjeta className="p-6 text-center">
            {isPending ? (
              <div className="space-y-3" role="status" aria-busy="true">
                <Esqueleto className="mx-auto h-6 w-40" />
                <Esqueleto className="h-10 w-full" />
              </div>
            ) : isError ? (
              <div className="space-y-4">
                <p className="text-sm text-danger">{error.message}</p>
                <Link to="/" className={clasesBoton("secundario", "sm")}>
                  Ir al inicio
                </Link>
              </div>
            ) : (
              <>
                <Eye className="mx-auto size-8 text-primary" aria-hidden="true" />
                <h1 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                  {data.empresa}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vas a ver la información de esta empresa en modo lectura. No vas a poder cargar ni
                  modificar nada.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Acceso otorgado como <span className="font-medium">{data.descripcion}</span>.
                  Vence el{" "}
                  {new Intl.DateTimeFormat("es-AR", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: "America/Argentina/Buenos_Aires",
                  }).format(new Date(data.expira))}
                  .
                </p>
                <Boton className="mt-5 w-full justify-center" onClick={entrar}>
                  Entrar
                </Boton>
              </>
            )}
          </Tarjeta>
        </div>
      </main>
    </div>
  );
}
