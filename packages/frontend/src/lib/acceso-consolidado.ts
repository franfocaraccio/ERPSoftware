/**
 * Acceso de solo lectura por link.
 *
 * El token vive en `sessionStorage` y no en una cookie: muere al cerrar la
 * pestaña, no viaja solo en cada request del navegador y no se mezcla con la
 * sesión de una cuenta real que el mismo navegador pueda tener abierta.
 */
const CLAVE = "erp.acceso-consolidado";

export interface AccesoGuardado {
  tenantId: string;
  token: string;
}

export function guardarAcceso(acceso: AccesoGuardado): void {
  sessionStorage.setItem(CLAVE, `${acceso.tenantId}:${acceso.token}`);
}

export function borrarAcceso(): void {
  sessionStorage.removeItem(CLAVE);
}

/** El valor tal cual viaja en el header, o null si no hay acceso activo. */
export function cabeceraAcceso(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    // sessionStorage puede no estar disponible (modo restringido del navegador).
    return null;
  }
}

export function hayAccesoPorLink(): boolean {
  return cabeceraAcceso() !== null;
}
