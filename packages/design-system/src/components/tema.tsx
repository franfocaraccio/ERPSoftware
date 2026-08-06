import { Monitor, Moon, Sun } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "../lib/cn.js";

export type Tema = "claro" | "oscuro" | "sistema";

const CLAVE_STORAGE = "erp-tema";

interface TemaContextValor {
  tema: Tema;
  setTema: (tema: Tema) => void;
  /** El tema efectivamente aplicado, ya resuelto si es "sistema". */
  resuelto: "claro" | "oscuro";
}

const TemaContext = createContext<TemaContextValor | null>(null);

function leerTemaGuardado(): Tema {
  const guardado = localStorage.getItem(CLAVE_STORAGE);
  return guardado === "claro" || guardado === "oscuro" || guardado === "sistema"
    ? guardado
    : "sistema";
}

function prefiereOscuro(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [tema, setTemaEstado] = useState<Tema>(leerTemaGuardado);
  const [resuelto, setResuelto] = useState<"claro" | "oscuro">(() =>
    leerTemaGuardado() === "oscuro" || (leerTemaGuardado() === "sistema" && prefiereOscuro())
      ? "oscuro"
      : "claro",
  );

  useEffect(() => {
    const aplicar = () => {
      const oscuro = tema === "oscuro" || (tema === "sistema" && prefiereOscuro());
      document.documentElement.classList.toggle("dark", oscuro);
      setResuelto(oscuro ? "oscuro" : "claro");
    };
    aplicar();

    if (tema !== "sistema") {
      return;
    }
    // Solo en modo "sistema" seguimos los cambios del SO en vivo.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", aplicar);
    return () => media.removeEventListener("change", aplicar);
  }, [tema]);

  const setTema = useCallback((nuevo: Tema) => {
    localStorage.setItem(CLAVE_STORAGE, nuevo);
    setTemaEstado(nuevo);
  }, []);

  return <TemaContext value={{ tema, setTema, resuelto }}>{children}</TemaContext>;
}

export function useTema(): TemaContextValor {
  const ctx = useContext(TemaContext);
  if (!ctx) {
    throw new Error("useTema debe usarse dentro de ProveedorTema");
  }
  return ctx;
}

const OPCIONES: { valor: Tema; etiqueta: string; Icono: typeof Sun }[] = [
  { valor: "claro", etiqueta: "Tema claro", Icono: Sun },
  { valor: "oscuro", etiqueta: "Tema oscuro", Icono: Moon },
  { valor: "sistema", etiqueta: "Según el sistema", Icono: Monitor },
];

/** Selector de tema de tres estados. El activo se marca con aria-pressed. */
export function ToggleTema() {
  const { tema, setTema } = useTema();
  return (
    <fieldset className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Tema de la interfaz</legend>
      {OPCIONES.map(({ valor, etiqueta, Icono }) => {
        const activo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            onClick={() => setTema(valor)}
            aria-label={etiqueta}
            aria-pressed={activo}
            title={etiqueta}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors duration-150",
              activo
                ? "bg-primary-subtle text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icono className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Script que corre antes del primer paint para evitar el flash de tema claro.
 * Se inyecta inline en index.html.
 */
export const SCRIPT_TEMA_INICIAL = `(()=>{try{const t=localStorage.getItem("${CLAVE_STORAGE}")||"sistema";const o=t==="oscuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",o)}catch{}})()`;
