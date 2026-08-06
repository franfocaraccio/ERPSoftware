import { cn } from "@erp/design-system";
import { useState } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import { Cheques } from "./cheques.js";
import { Cuentas } from "./cuentas.js";
import { Movimientos } from "./movimientos.js";

const VISTAS = [
  { id: "cuentas", etiqueta: "Cuentas" },
  { id: "movimientos", etiqueta: "Movimientos" },
  { id: "cheques", etiqueta: "Cheques en cartera" },
] as const;

type Vista = (typeof VISTAS)[number]["id"];

export function Tesoreria() {
  const [vista, setVista] = useState<Vista>("cuentas");

  return (
    <>
      <EncabezadoPagina
        titulo="Tesorería"
        descripcion="Saldos por cuenta, movimientos de caja y cheques en cartera."
      />

      {/* Pestañas: las tres tablas del módulo viven en una sola pantalla. */}
      <div
        role="tablist"
        aria-label="Vistas de tesorería"
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
        {vista === "cuentas" && <Cuentas />}
        {vista === "movimientos" && <Movimientos />}
        {vista === "cheques" && <Cheques />}
      </div>
    </>
  );
}
