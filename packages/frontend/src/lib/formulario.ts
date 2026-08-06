/** Los errores de TanStack Form llegan como issues de Zod o como strings. */
export function primerError(errores: unknown[]): string | undefined {
  const error = errores[0];
  if (!error) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return undefined;
}

/** Los campos vacíos no se envían: el backend los distingue de "" y guarda null. */
export function opcional(valor: string): string | undefined {
  const limpio = valor.trim();
  return limpio === "" ? undefined : limpio;
}
