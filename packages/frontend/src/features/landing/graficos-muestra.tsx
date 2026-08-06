/**
 * Gráficos de muestra de la portada.
 *
 * Son SVG propios y no Recharts a propósito: la portada es lo primero que
 * carga un visitante anónimo y Recharts pesa casi 400 kB. Acá los datos son
 * fijos y no hay interacción, así que un SVG estático alcanza y la página
 * queda liviana.
 *
 * Los colores salen de los mismos tokens que los gráficos reales del panel
 * (--color-chart-1 / --color-chart-2), ya validados en claro y en oscuro.
 */

const ANCHO = 340;
const ALTO = 130;
const MARGEN = { arriba: 8, derecha: 6, abajo: 18, izquierda: 30 };
const AREA_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;
const AREA_ALTO = ALTO - MARGEN.arriba - MARGEN.abajo;

const EJE_TEXTO = {
  fill: "var(--color-chart-axis)",
  fontSize: 9,
} as const;

// --- Proyección de saldo ---

/** Saldo al cierre de cada semana, en millones de pesos. */
const SALDOS = [2.42, 2.31, 2.05, 2.18, 1.86, 1.62, 1.71, 1.44, 1.19, 0.95, 0.72, 0.88, 0.61];
const MINIMO_OPERATIVO = 0.8;
const TOPE = 2.6;

const x = (i: number) => MARGEN.izquierda + (i * AREA_ANCHO) / (SALDOS.length - 1);
const y = (valor: number) => MARGEN.arriba + AREA_ALTO - (valor / TOPE) * AREA_ALTO;

const PUNTOS = SALDOS.map((valor, i) => ({ semana: i + 1, cx: x(i), cy: y(valor) }));

const LINEA = PUNTOS.map(
  (p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`,
).join(" ");

export function MuestraProyeccion() {
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="h-auto w-full"
      role="img"
      aria-label="Proyección de saldo a trece semanas: arranca en 2,4 millones de pesos y desciende hasta 0,6 millones, cruzando el mínimo operativo de 800 mil en la semana 11."
    >
      <title>Proyección de saldo a trece semanas</title>

      {/* Grilla recesiva: orienta sin competir con la serie. */}
      {[0, 1.3, 2.6].map((v) => (
        <g key={v}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-chart-grid)"
            strokeWidth={1}
          />
          <text x={MARGEN.izquierda - 6} y={y(v) + 3} textAnchor="end" {...EJE_TEXTO}>
            {v === 0 ? "0" : `${v.toString().replace(".", ",")} M`}
          </text>
        </g>
      ))}

      {/* Umbral: es la razón de ser del gráfico, va punteado y rotulado. */}
      <line
        x1={MARGEN.izquierda}
        x2={ANCHO - MARGEN.derecha}
        y1={y(MINIMO_OPERATIVO)}
        y2={y(MINIMO_OPERATIVO)}
        stroke="var(--color-danger)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      {/* El rótulo va a la izquierda: sobre el margen derecho la curva cruza
          justo el umbral y el texto se le montaría encima. */}
      <text
        x={MARGEN.izquierda + 4}
        y={y(MINIMO_OPERATIVO) - 4}
        textAnchor="start"
        fill="var(--color-danger)"
        fontSize={9}
      >
        Mínimo operativo
      </text>

      <path d={LINEA} fill="none" stroke="var(--color-chart-1)" strokeWidth={2} />
      {PUNTOS.map((p) => (
        <circle key={p.semana} cx={p.cx} cy={p.cy} r={2.5} fill="var(--color-chart-1)" />
      ))}

      {[0, 4, 8, 12].map((i) => (
        <text key={i} x={x(i)} y={ALTO - 4} textAnchor="middle" {...EJE_TEXTO}>
          S{i + 1}
        </text>
      ))}
    </svg>
  );
}

// --- Cobros y pagos ---

/** Cobros y pagos de cada semana, en miles de pesos. */
const FLUJO = [
  { semana: "S1", cobros: 640, pagos: 520 },
  { semana: "S2", cobros: 410, pagos: 600 },
  { semana: "S3", cobros: 780, pagos: 430 },
  { semana: "S4", cobros: 520, pagos: 710 },
  { semana: "S5", cobros: 690, pagos: 380 },
  { semana: "S6", cobros: 450, pagos: 620 },
];
const TOPE_FLUJO = 800;

const ANCHO_GRUPO = AREA_ANCHO / FLUJO.length;
const ANCHO_BARRA = 11;
const SEPARACION = 2; // deja ver el fondo entre barras vecinas

/** Barra con las esquinas de arriba redondeadas y la base apoyada en el eje. */
function barra(bx: number, altura: number): string {
  const by = MARGEN.arriba + AREA_ALTO - altura;
  const r = Math.min(3, altura);
  const base = MARGEN.arriba + AREA_ALTO;
  return `M${bx},${base} L${bx},${by + r} Q${bx},${by} ${bx + r},${by} L${bx + ANCHO_BARRA - r},${by} Q${bx + ANCHO_BARRA},${by} ${bx + ANCHO_BARRA},${by + r} L${bx + ANCHO_BARRA},${base} Z`;
}

export function MuestraFlujo() {
  const alto = (v: number) => (v / TOPE_FLUJO) * AREA_ALTO;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="h-auto w-full"
      role="img"
      aria-label="Cobros y pagos de las próximas seis semanas: los cobros van de 410 a 780 mil pesos y los pagos de 380 a 710 mil."
    >
      <title>Cobros y pagos por semana</title>

      {[0, 400, 800].map((v) => (
        <g key={v}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(0) - alto(v)}
            y2={y(0) - alto(v)}
            stroke="var(--color-chart-grid)"
            strokeWidth={1}
          />
          <text x={MARGEN.izquierda - 6} y={y(0) - alto(v) + 3} textAnchor="end" {...EJE_TEXTO}>
            {v === 0 ? "0" : `${v} k`}
          </text>
        </g>
      ))}

      {FLUJO.map(({ semana, cobros, pagos }, i) => {
        const centro = MARGEN.izquierda + ANCHO_GRUPO * i + ANCHO_GRUPO / 2;
        const inicio = centro - ANCHO_BARRA - SEPARACION / 2;
        return (
          <g key={semana}>
            <path d={barra(inicio, alto(cobros))} fill="var(--color-chart-1)" />
            <path
              d={barra(inicio + ANCHO_BARRA + SEPARACION, alto(pagos))}
              fill="var(--color-chart-2)"
            />
            <text x={centro} y={ALTO - 4} textAnchor="middle" {...EJE_TEXTO}>
              {semana}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Leyenda del gráfico de flujo: con dos series nunca alcanza el color solo. */
export function LeyendaFlujo() {
  return (
    <ul className="flex items-center gap-4 text-xs text-muted-foreground">
      {[
        { etiqueta: "Cobros", color: "var(--color-chart-1)" },
        { etiqueta: "Pagos", color: "var(--color-chart-2)" },
      ].map(({ etiqueta, color }) => (
        <li key={etiqueta} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          {etiqueta}
        </li>
      ))}
    </ul>
  );
}
