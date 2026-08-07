import {
  adminClient,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
  plugins: [organizationClient(), adminClient(), magicLinkClient(), twoFactorClient()],
});

export const { useSession, signIn, signOut } = authClient;

/** Roles del dominio, en el mismo orden que el backend. */
export const ETIQUETA_ROL: Record<string, string> = {
  administrador: "Administrador",
  escritura_lectura: "Escritura/Lectura",
  solo_lectura: "Solo lectura",
};
