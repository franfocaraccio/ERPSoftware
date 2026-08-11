import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { esRutaConocida } from "./rutas.js";

/**
 * Render mínimo de la respuesta del asistente: links internos, negrita y
 * saltos de línea. Nada más.
 *
 * No entra una librería de markdown porque el asistente escribe con un formato
 * que le dictamos nosotros en el prompt, y porque todo acá se arma con nodos de
 * React: no hay `dangerouslySetInnerHTML` en ningún lado, así que el texto que
 * devuelve el modelo no puede inyectar HTML aunque lo intente.
 */

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

/**
 * La negrita es la estructura de afuera y los links van adentro, no al revés.
 *
 * El modelo escribe `**[Comprobantes](/comprobantes)**` y lo hace seguido. Si
 * se buscan los links primero, la línea queda partida en pedazos y los dos `**`
 * de un mismo par caen en pedazos distintos: dejan de emparejarse, aparece un
 * `**` suelto en pantalla y se termina poniendo en negrita el texto que va
 * entre dos links en lugar de los links. Pasó de verdad, no es hipotético.
 *
 * Al revés funciona porque el contenido de una negrita nunca tiene `*`, así que
 * un link entero entra sin cortar el par.
 */
function formatearLinea(linea: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;

  NEGRITA.lastIndex = 0;
  let coincidencia = NEGRITA.exec(linea);
  while (coincidencia !== null) {
    if (coincidencia.index > ultimo) {
      nodos.push(...conLinks(linea.slice(ultimo, coincidencia.index), `t${clave++}`));
    }
    nodos.push(
      <strong key={`n${clave++}`} className="font-semibold">
        {conLinks(coincidencia[1] ?? "", `n${clave}`)}
      </strong>,
    );
    ultimo = coincidencia.index + coincidencia[0].length;
    coincidencia = NEGRITA.exec(linea);
  }

  if (ultimo < linea.length) {
    nodos.push(...conLinks(linea.slice(ultimo), `t${clave++}`));
  }
  return nodos;
}

function conLinks(texto: string, prefijo: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;

  LINK.lastIndex = 0;
  let coincidencia = LINK.exec(texto);
  while (coincidencia !== null) {
    const etiqueta = coincidencia[1] ?? "";
    const ruta = coincidencia[2] ?? "";

    if (coincidencia.index > ultimo) {
      nodos.push(texto.slice(ultimo, coincidencia.index));
    }

    if (esRutaConocida(ruta)) {
      nodos.push(
        <Link
          key={`${prefijo}l${clave++}`}
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
    coincidencia = LINK.exec(texto);
  }

  if (ultimo < texto.length) {
    nodos.push(texto.slice(ultimo));
  }
  return nodos;
}
