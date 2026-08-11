import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Render mínimo de la respuesta del asistente: links internos, negrita y
 * saltos de línea. Nada más.
 *
 * No entra una librería de markdown porque el asistente escribe con un formato
 * que le dictamos nosotros en el prompt, y porque todo acá se arma con nodos de
 * React: no hay `dangerouslySetInnerHTML` en ningún lado, así que el texto que
 * devuelve el modelo no puede inyectar HTML aunque lo intente.
 */

/**
 * Rutas que el asistente puede linkear.
 *
 * Es una lista blanca, no una validación de formato: el modelo escribe el
 * destino y podría inventar una ruta que no existe, o escribirla con una
 * variante que el router no matchea. Un link roto es peor que texto plano
 * —promete algo y no cumple—, así que lo que no está acá se muestra como
 * texto y listo.
 *
 * Quedan afuera a propósito las rutas con parámetro (`/clientes/$clienteId`):
 * sin el id no hay nada a dónde ir.
 */
const RUTAS = [
  "/panel",
  "/clientes",
  "/clientes/nuevo",
  "/proveedores",
  "/proveedores/nuevo",
  "/stock",
  "/stock/nuevo",
  "/tesoreria",
  "/impuestos",
  "/impuestos/nueva",
  "/comprobantes",
  "/comprobantes/nuevo",
  "/equipo",
  "/parametros",
  "/historial",
  "/accesos",
  "/recuperar",
] as const;

type RutaConocida = (typeof RUTAS)[number];

function esRutaConocida(ruta: string): ruta is RutaConocida {
  return (RUTAS as readonly string[]).includes(ruta);
}

/** `[texto](/ruta)` — solo rutas internas: cualquier otra cosa queda como texto. */
const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
const NEGRITA = /\*\*([^*]+)\*\*/g;

export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  return (
    <>
      {lineas.map((linea, i) => (
        // Las líneas no tienen id y el texto se reescribe mientras streamea:
        // el índice es la única clave estable acá.
        // biome-ignore lint/suspicious/noArrayIndexKey: ver comentario
        <p key={i} className={linea.trim() === "" ? "h-2" : "whitespace-pre-wrap"}>
          {formatearLinea(linea)}
        </p>
      ))}
    </>
  );
}

function formatearLinea(linea: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;

  LINK.lastIndex = 0;
  let coincidencia = LINK.exec(linea);
  while (coincidencia !== null) {
    const etiqueta = coincidencia[1] ?? "";
    const ruta = coincidencia[2] ?? "";

    if (coincidencia.index > ultimo) {
      nodos.push(...conNegrita(linea.slice(ultimo, coincidencia.index), `t${clave++}`));
    }

    if (esRutaConocida(ruta)) {
      nodos.push(
        <Link
          key={`l${clave++}`}
          to={ruta}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {etiqueta}
        </Link>,
      );
    } else {
      nodos.push(etiqueta);
    }

    ultimo = coincidencia.index + coincidencia[0].length;
    coincidencia = LINK.exec(linea);
  }

  if (ultimo < linea.length) {
    nodos.push(...conNegrita(linea.slice(ultimo), `t${clave++}`));
  }
  return nodos;
}

function conNegrita(texto: string, prefijo: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;

  NEGRITA.lastIndex = 0;
  let coincidencia = NEGRITA.exec(texto);
  while (coincidencia !== null) {
    if (coincidencia.index > ultimo) {
      nodos.push(texto.slice(ultimo, coincidencia.index));
    }
    nodos.push(
      <strong key={`${prefijo}b${clave++}`} className="font-semibold">
        {coincidencia[1] ?? ""}
      </strong>,
    );
    ultimo = coincidencia.index + coincidencia[0].length;
    coincidencia = NEGRITA.exec(texto);
  }

  if (ultimo < texto.length) {
    nodos.push(texto.slice(ultimo));
  }
  return nodos;
}
