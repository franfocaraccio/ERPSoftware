import { z } from "zod";
import { ROLES_ORGANIZACION } from "../../auth/roles.js";

/**
 * Roles que un Administrador puede asignar al invitar. Son todos: una PyME
 * puede tener más de un socio con acceso total, y obligarlos a pedírnoslo a
 * nosotros para eso no tiene sentido.
 */
export const rolAsignableSchema = z.enum(ROLES_ORGANIZACION);

export const invitarSchema = z.object({
  email: z.email("Ingresá un email válido"),
  rol: rolAsignableSchema,
  /**
   * Acceso al panel de indicadores. Viene tildado por defecto: quien invita
   * decide explícitamente quitarlo.
   */
  verPanel: z.boolean().default(true),
});

export const cambiarAccesoPanelSchema = z.object({
  usuarioId: z.string().min(1),
  verPanel: z.boolean(),
});

export const cancelarInvitacionSchema = z.object({
  invitacionId: z.string().min(1),
});

export const cambiarRolSchema = z.object({
  usuarioId: z.string().min(1),
  rol: rolAsignableSchema,
});

export const quitarMiembroSchema = z.object({
  usuarioId: z.string().min(1),
});

export type Invitar = z.infer<typeof invitarSchema>;
export type CambiarAccesoPanel = z.infer<typeof cambiarAccesoPanelSchema>;
