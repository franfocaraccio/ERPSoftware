import { Boton, Tarjeta } from "@erp/design-system";
import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Estado "copiado" que se apaga solo, compartido por los dos componentes. */
function useCopiar(link: string) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) {
      return;
    }
    const id = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(id);
  }, [copiado]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles queda el texto a la vista para copiarlo a mano.
      setCopiado(false);
    }
  };

  return { copiado, copiar };
}

/** Botón compacto, para filas de un listado. */
export function BotonCopiarLink({ link }: { link: string }) {
  const { copiado, copiar } = useCopiar(link);
  return (
    <Boton variante="secundario" tamano="sm" onClick={() => void copiar()}>
      {copiado ? (
        <>
          <Check className="size-4" aria-hidden="true" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="size-4" aria-hidden="true" />
          Copiar link
        </>
      )}
    </Boton>
  );
}

/**
 * Link de invitación a la vista, con botón para copiarlo.
 *
 * Es temporal: existe porque todavía no hay proveedor de correo configurado y
 * el mail no sale. Cuando el envío funcione, esto puede quedar como respaldo
 * pero deja de ser el camino principal.
 */
export function LinkInvitacion({ link, email }: { link: string; email?: string }) {
  const { copiado, copiar } = useCopiar(link);

  return (
    <Tarjeta className="border-primary/40 bg-primary-subtle p-4">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Link de invitación{email ? ` para ${email}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Todavía no mandamos mails: pasáselo vos. Con este link define su contraseña y entra.
          </p>
          {/* Seleccionable a mano por si el portapapeles está bloqueado. */}
          <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs break-all text-foreground">
            {link}
          </code>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={() => void copiar()}>
          {copiado ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              Copiar
            </>
          )}
        </Boton>
      </div>
      <p className="sr-only" role="status">
        {copiado ? "Link copiado al portapapeles" : ""}
      </p>
    </Tarjeta>
  );
}
