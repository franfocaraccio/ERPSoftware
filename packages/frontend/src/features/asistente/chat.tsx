import { useChat } from "@ai-sdk/react";
import { Boton, cn } from "@erp/design-system";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cabeceraAcceso } from "../../lib/acceso-consolidado.js";
import { Markdown } from "./markdown.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const SUGERENCIAS = [
  "¿Cómo creo un comprobante?",
  "¿Cómo invito a un usuario?",
  "¿De dónde sale el próximo vencimiento?",
];

/**
 * Asistente de ayuda: burbuja abajo a la derecha que abre un panel de chat.
 *
 * Responde sobre cómo usar la aplicación. No tiene acceso a los datos de la
 * empresa —eso es una fase posterior—, y el prompt del servidor le exige
 * decirlo en vez de improvisar una cifra.
 */
export function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const entradaRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API}/api/chat`,
        // Igual que el cliente tRPC: la cookie de sesión viaja siempre, y si
        // esta pestaña entró por un link de solo lectura, el token va aparte.
        credentials: "include",
        headers: () => {
          const acceso = cabeceraAcceso();
          return acceso ? { "x-acceso-consolidado": acceso } : {};
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const ocupado = status === "submitted" || status === "streaming";

  // Cada mensaje aplanado a su texto. Se calcula una vez y sirve para dos
  // cosas: renderizar las burbujas y detectar que la respuesta creció.
  const burbujas = messages.map((mensaje) => ({
    id: mensaje.id,
    role: mensaje.role,
    texto: mensaje.parts.map((parte) => (parte.type === "text" ? parte.text : "")).join(""),
  }));

  const largoTotal = burbujas.reduce((total, b) => total + b.texto.length, 0);

  useEffect(() => {
    if (abierto) {
      entradaRef.current?.focus();
    }
  }, [abierto]);

  // Seguir el final mientras streamea; si no, la respuesta larga crece fuera
  // de la vista y parece que no pasa nada. El disparador es el largo del texto
  // y no el array de mensajes: durante el streaming se agregan tokens dentro
  // del mismo mensaje, así que contar mensajes no alcanzaría.
  useEffect(() => {
    if (largoTotal > 0) {
      finRef.current?.scrollIntoView({ block: "end" });
    }
  }, [largoTotal]);

  function enviar(contenido: string) {
    const limpio = contenido.trim();
    if (!limpio || ocupado) {
      return;
    }
    sendMessage({ text: limpio });
    setTexto("");
  }

  return (
    <>
      {!abierto && (
        <Boton
          variante="primario"
          onClick={() => setAbierto(true)}
          aria-label="Abrir el asistente de ayuda"
          className="fixed right-4 bottom-4 z-40 size-14 justify-center rounded-full p-0 shadow-lg"
        >
          <MessageCircle className="size-6" aria-hidden="true" />
        </Boton>
      )}

      {abierto && (
        <section
          aria-label="Asistente de ayuda"
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden border border-border bg-surface shadow-xl",
            // En el teléfono ocupa casi toda la pantalla; en desktop es un
            // panel al costado que no tapa el contenido.
            "inset-x-0 bottom-0 top-16 rounded-t-2xl",
            "sm:inset-auto sm:right-4 sm:bottom-4 sm:top-auto sm:h-[min(34rem,calc(100vh-6rem))] sm:w-96 sm:rounded-2xl",
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Ayuda</h2>
              <p className="text-xs text-muted-foreground">Cómo usar el sistema</p>
            </div>
            <Boton
              variante="fantasma"
              tamano="icono"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el asistente"
            >
              <X className="size-4" aria-hidden="true" />
            </Boton>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Preguntame cómo hacer algo en el sistema. Todavía no puedo ver los datos de tu
                  empresa, así que para cifras concretas te digo dónde mirarlas.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  {SUGERENCIAS.map((sugerencia) => (
                    <button
                      key={sugerencia}
                      type="button"
                      onClick={() => enviar(sugerencia)}
                      className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                    >
                      {sugerencia}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {burbujas.map((burbuja) =>
              burbuja.texto ? (
                <div
                  key={burbuja.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2",
                    burbuja.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-surface-muted text-foreground",
                  )}
                >
                  {burbuja.role === "user" ? (
                    <p className="whitespace-pre-wrap">{burbuja.texto}</p>
                  ) : (
                    <Markdown texto={burbuja.texto} />
                  )}
                </div>
              ) : null,
            )}

            {status === "submitted" && (
              <p className="text-xs text-muted-foreground" role="status">
                Pensando…
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
                No se pudo responder. Probá de nuevo en un momento.
              </p>
            )}

            <div ref={finRef} />
          </div>

          <form
            className="flex items-center gap-2 border-t border-border px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <label htmlFor="asistente-entrada" className="sr-only">
              Escribí tu consulta
            </label>
            <input
              id="asistente-entrada"
              ref={entradaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribí tu consulta"
              autoComplete="off"
              className="h-10 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring"
            />
            <Boton
              type="submit"
              tamano="icono"
              disabled={!texto.trim() || ocupado}
              cargando={ocupado}
              aria-label="Enviar"
            >
              {!ocupado && <Send className="size-4" aria-hidden="true" />}
            </Boton>
          </form>
        </section>
      )}
    </>
  );
}
