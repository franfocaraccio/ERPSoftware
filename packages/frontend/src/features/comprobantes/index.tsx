import { cn } from "@erp/design-system";
import { useState } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import { Compras } from "./compras.js";
import { Ventas } from "./ventas.js";

const VISTAS = [
  { id: "ventas", etiqueta: "Ventas" },
  { id: "compras", etiqueta: "Compras" },
] as const;

type Vista = (typeof VISTAS)[number]["id"];

export function Comprobantes() {
  const [vista, setVista] = useState<Vista>("ventas");

  return (
    <>
      <EncabezadoPagina
        titulo="Comprobantes"
        descripcion="Facturación de ventas y comprobantes de compra recibidos."
      />

      <div
        role="tablist"
        aria-label="Tipo de comprobante"
        className="mb-5 flex gap-1 border-b border-border"
      >
        {VISTAS.map(({ id, etiqueta }) => {
          const activa = vista === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={activa}
              aria-controls={`panel-${id}`}
              onClick={() => setVista(id)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
                activa
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${vista}`} aria-labelledby={`tab-${vista}`}>
        {vista === "ventas" ? <Ventas /> : <Compras />}
      </div>
    </>
  );
}
