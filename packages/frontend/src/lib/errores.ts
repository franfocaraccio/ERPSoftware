/**
 * Mensaje de error listo para mostrarle a una persona.
 *
 * Cuando el servidor rechaza un input, tRPC serializa el ZodError como un
 * array JSON dentro de `message`. Si eso se pinta tal cual, el usuario ve
 * `[ { "code": "custom", "path": [ "cuit" ], ... } ]` en vez de una frase.
 *
 * Cada formulario valida con Zod del lado del cliente, así que llegar acá con
 * un error de validación significa que el navegador y el servidor no estaban
 * de acuerdo. Se muestra igual —el dato es real y el usuario tiene que poder
 * corregirlo— pero es señal de que a alguna regla le falta su versión en el
 * formulario.
 */
export function mensajeDeError(error: { message: string }): string {
  const crudo = error.message;

  if (!crudo.trimStart().startsWith("[")) {
    return crudo;
  }

  try {
    const issues: unknown = JSON.parse(crudo);
    if (!Array.isArray(issues)) {
      return crudo;
    }
    const mensajes = issues
      .map((issue) =>
        typeof issue === "object" && issue !== null && "message" in issue
          ? String((issue as { message: unknown }).message)
          : null,
      )
      .filter((m): m is string => Boolean(m));

    return mensajes.length > 0 ? mensajes.join(". ") : crudo;
  } catch {
    // No era JSON: es un mensaje normal que arranca con corchete.
    return crudo;
  }
}
