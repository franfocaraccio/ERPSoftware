import type { AppRouter } from "@erp/backend/router";
import { ProveedorTema } from "@erp/design-system";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TRPCProvider } from "./lib/trpc.js";
import { router } from "./router.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/trpc`,
      // credentials: include para que las cookies de sesión viajen cuando
      // se enchufe BetterAuth. El signal se normaliza porque tRPC lo tipa
      // como opcional y RequestInit lo espera como AbortSignal | null.
      fetch: (url, options) =>
        fetch(url, { ...options, signal: options?.signal ?? null, credentials: "include" }),
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
