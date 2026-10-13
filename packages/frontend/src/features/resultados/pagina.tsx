import { EncabezadoPagina } from "../../components/layout.js";
import { Categorias, GastosRecurrentes } from "./configuracion.js";
import { EstadoResultados } from "./estado.js";
import { Rentabilidad } from "./rentabilidad.js";

/**
 * Si la empresa gana plata, y dónde. El panel muestra la caja y el capital de
 * trabajo; esto muestra la rentabilidad.
 */
export function Resultados() {
  return (
    <>
      <EncabezadoPagina
        titulo="Resultados"
        descripcion="Estado de resultados mensual y rentabilidad por cliente y producto."
      />
      <EstadoResultados />
      <Rentabilidad />
      <GastosRecurrentes />
      <Categorias />
    </>
  );
}
