import { Dialog } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Panel lateral que entra desde el borde izquierdo, por encima del contenido.
 *
 * Es la navegación en pantallas chicas: con ocho destinos y un submenú, una
 * tira horizontal deja la mitad escondida detrás de un scroll que nadie
 * descubre, y una lista fija empuja el contenido abajo del fold.
 *
 * Sobre Base UI Dialog, que ya resuelve foco atrapado, Escape y bloqueo del
 * scroll de fondo. Hacerlo a mano es la parte que siempre queda a medias.
 */
export function Cajon({
  abierto,
  onAbiertoChange,
  titulo,
  children,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={abierto} onOpenChange={onAbiertoChange}>
      <Dialog.Portal>
        {/*
         * `data-[closed]:hidden` no es decorativo: Base UI deja el popup
         * montado después de cerrar, esperando una animación de salida. Sin
         * una regla que lo esconda, el cajón se queda tapando la pantalla con
         * `data-closed` puesto — que es exactamente lo que pasaba.
         *
         * La entrada sí se anima, con `data-[starting-style]`.
         */}
        <Dialog.Backdrop
          className={
            "fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] transition-opacity duration-200 " +
            "data-[closed]:hidden data-[starting-style]:opacity-0"
          }
        />
        <Dialog.Popup
          className={
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto " +
            "border-r border-border bg-surface py-5 shadow-[--shadow-popover] " +
            "transition-transform duration-200 ease-out " +
            "data-[closed]:hidden data-[starting-style]:-translate-x-full"
          }
        >
          <div className="flex items-start justify-between gap-2 px-5">
            <Dialog.Title className="text-sm font-semibold tracking-tight text-foreground">
              {titulo}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar el menú"
              className="-mt-1 cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
