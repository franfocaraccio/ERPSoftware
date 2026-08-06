import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import type { ReactNode } from "react";
import { Boton } from "./button.js";

/**
 * Diálogo de confirmación para acciones destructivas o irreversibles.
 * Sobre Base UI: maneja foco, escape y scroll lock.
 */
export function DialogoConfirmacion({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar = "Confirmar",
  destructivo = false,
  cargando = false,
  onConfirmar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion: ReactNode;
  textoConfirmar?: string;
  destructivo?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog.Root open={abierto} onOpenChange={onAbiertoChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px]" />
        <AlertDialog.Popup
          className={
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 " +
            "rounded-[--radius-card] border border-border bg-surface p-6 shadow-[--shadow-popover]"
          }
        >
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            {titulo}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {descripcion}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Close
              render={
                <Boton variante="secundario" tamano="sm" disabled={cargando}>
                  Cancelar
                </Boton>
              }
            />
            <Boton
              variante={destructivo ? "peligro" : "primario"}
              tamano="sm"
              cargando={cargando}
              onClick={onConfirmar}
            >
              {textoConfirmar}
            </Boton>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
