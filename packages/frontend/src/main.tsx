import type { AppRouter } from "@erp/backend/router";
import { ProveedorTema } from "@erp/design-system";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { cabeceraAcceso } from "./lib/acceso-consolidado.js";
import { TRPCProvider } from "./lib/trpc.js";
import { router } from "./router.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

/**
 * True si el servidor rechazó la sesión. Se lee sobre un clon para no
 * consumir el cuerpo que después va a leer tRPC.
 */
async function tokenRechazado(respuesta: Response): Promise<boolean> {
  if (respuesta.status === 401) {
    return true;
  }
  if (respuesta.status !== 207) {
    return false;
  }
  try {
    const cuerpo = (await respuesta.clone().json()) as unknown;
    const partes = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    return partes.some(
      (p) => (p as { error?: { data?: { httpStatus?: number } } })?.error?.data?.httpStatus === 401,
    );
  } catch {
    return false;
  }
}

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/trpc`,
      // credentials: include para que viajen las cookies de sesión. El signal
      // se normaliza porque tRPC lo tipa como opcional y RequestInit lo espera
      // como AbortSignal | null.
      fetch: async (url, options) => {
        // Si esta pestaña entró por un link de solo lectura, el token va en un
        // header. El servidor le da prioridad sobre la cookie.
        const acceso = cabeceraAcceso();
        const headers = new Headers(options?.headers);
        if (acceso) {
          headers.set("x-acceso-consolidado", acceso);
        }
        const respuesta = await fetch(url, {
          ...options,
          headers,
          signal: options?.signal ?? null,
          credentials: "include",
        });

        // Un acceso por link puede morir en cualquier momento: lo revocan o
        // vence. Sin esto la pantalla se queda cargando para siempre, sin
        // decirle a la persona que su acceso terminó.
        //
        // No alcanza con mirar el status: el link de batch mete varias
        // llamadas en un request y tRPC responde 207 aunque adentro haya un
        // 401. Hay que abrir el cuerpo.
        //
        // El token NO se borra acá: mientras la navegación está en curso el
        // guardia lo sigue tomando como acceso válido y no rebota al login.
        // Lo limpia la pantalla de destino, que es la que confirma que murió.
        if (acceso && (await tokenRechazado(respuesta))) {
          const separador = acceso.indexOf(":");
          window.location.assign(
            `/consolidado/${acceso.slice(0, separador)}/${acceso.slice(separador + 1)}`,
          );
        }

        return respuesta;
      },
    }),
  ],
});

const contenedor = document.getElementById("root");
if (!contenedor) {
  throw new Error("No se encontró el elemento #root");
}

createRoot(contenedor).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ProveedorTema>
          <RouterProvider router={router} />
        </ProveedorTema>
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
