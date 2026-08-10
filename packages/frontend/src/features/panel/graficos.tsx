import { Boton, Tarjeta } from "@erp/design-system";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";

export interface FilaProyeccion {
  semana: number;
  inicio: string;
  fin: string;
  cobros: string;
  pagos: string;
  saldoInicial: string;
  saldoFinal: string;
  semaforo: "ok" | "alerta";
}

/** Escala compacta para los ejes: 1.500.000 se lee mejor como "1,5 M". */
const COMPACTO = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

const ejeY = (valor: number) => COMPACTO.format(valor);

/** Tooltip propio: el de Recharts no respeta los tokens del tema. */
function Tooltipe({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[--shadow-popover]">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          {p.name}:{" "}
          <span className="tabular font-medium text-foreground">
            {formatearImporte(String(p.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

const EJE = {
  stroke: "var(--color-chart-axis)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Trayectoria del saldo. Va en su propio gráfico y no superpuesta a los flujos
 * semanales: son magnitudes muy distintas y meterlas en un mismo panel exigiría
 * dos ejes, que es la forma más común de mentir con un gráfico.
 */
export function GraficoSaldoProyectado({
  datos,
  minimoOperativo,
}: {
  datos: FilaProyeccion[];
  minimoOperativo: string | null;
}) {
  const [verTabla, setVerTabla] = useState(false);

  const serie = datos.map((f) => ({
    semana: `S${f.semana}`,
    inicio: f.inicio,
    saldo: Number(f.saldoFinal),
  }));

  const hayAlerta = datos.some((f) => f.semaforo === "alerta");

  return (
    <Tarjeta className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Saldo proyectado</h2>
          <p className="text-xs text-muted-foreground">
            Trece semanas, arrancando por la semana en curso
          </p>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </Boton>
      </div>

      {hayAlerta && (
        <p role="status" className="mb-3 text-xs font-medium text-danger">
          Hay semanas donde el saldo cae por debajo del mínimo operativo.
        </p>
      )}

      {verTabla ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Proyección de saldo por semana</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                {["Semana", "Desde", "Cobros", "Pagos", "Saldo final"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((f) => (
                <tr key={f.semana} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5 tabular text-foreground">S{f.semana}</td>
                  <td className="px-2 py-1.5 tabular text-muted-foreground">
                    {formatearFecha(f.inicio)}
                  </td>
                  <td className="px-2 py-1.5 tabular text-muted-foreground">
                    {formatearImporte(f.cobros)}
                  </td>
                  <td className="px-2 py-1.5 tabular text-muted-foreground">
                    {formatearImporte(f.pagos)}
                  </td>
                  <td
                    className={`px-2 py-1.5 tabular font-medium ${f.semaforo === "alerta" ? "text-danger" : "text-foreground"}`}
                  >
                    {formatearImporte(f.saldoFinal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={serie} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
            <XAxis dataKey="semana" {...EJE} />
            <YAxis tickFormatter={ejeY} width={52} {...EJE} />
            <Tooltip content={<Tooltipe />} cursor={{ stroke: "var(--color-chart-grid)" }} />
            {minimoOperativo && (
              <ReferenceLine
                y={Number(minimoOperativo)}
                stroke="var(--color-danger)"
                strokeDasharray="4 4"
                label={{
                  value: "Mínimo operativo",
                  position: "insideTopRight",
                  fill: "var(--color-danger)",
                  fontSize: 11,
                }}
              />
            )}
            <ReferenceLine y={0} stroke="var(--color-chart-axis)" />
            <Line
              type="monotone"
              dataKey="saldo"
              name="Saldo"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "var(--color-chart-1)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Tarjeta>
  );
}

/** Cobros y pagos por semana: dos series, con leyenda porque son dos. */
export function GraficoFlujoSemanal({ datos }: { datos: FilaProyeccion[] }) {
  const serie = datos.map((f) => ({
    semana: `S${f.semana}`,
    cobros: Number(f.cobros),
    pagos: Number(f.pagos),
  }));

  return (
    <Tarjeta className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Cobros y pagos por semana</h2>
        <p className="text-xs text-muted-foreground">Lo que entra y sale en cada semana</p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={serie} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
          <XAxis dataKey="semana" {...EJE} />
          <YAxis tickFormatter={ejeY} width={52} {...EJE} />
          <Tooltip content={<Tooltipe />} cursor={{ fill: "var(--color-surface-muted)" }} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }}
          />
          {/* Punta redondeada arriba y base apoyada en el eje: la altura es el
              dato, así que el arranque no se redondea. La separación deja ver
              el fondo entre barras vecinas, que es lo que las distingue.
              maxBarSize acota el ancho para que el radio no se coma la barra. */}
          <Bar
            dataKey="cobros"
            name="Cobros"
            fill="var(--color-chart-1)"
            radius={[6, 6, 0, 0]}
            maxBarSize={24}
          />
          <Bar
            dataKey="pagos"
            name="Pagos"
            fill="var(--color-chart-2)"
            radius={[6, 6, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </Tarjeta>
  );
}

/** Evolución de ventas. Con un solo mes cargado un gráfico no dice nada. */
export function GraficoVentas({ datos }: { datos: { mes: string; total: string }[] }) {
  if (datos.length < 2) {
    return (
      <Tarjeta className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Evolución de ventas</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Hace falta al menos dos meses facturados para ver una tendencia.
        </p>
        {datos[0] && (
          <p className="mt-4 text-2xl font-semibold text-foreground">
            {formatearImporte(datos[0].total)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              facturado en {datos[0].mes}
            </span>
          </p>
        )}
      </Tarjeta>
    );
  }

  const serie = datos.map((d) => ({ mes: d.mes, total: Number(d.total) }));

  return (
    <Tarjeta className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Evolución de ventas</h2>
        <p className="text-xs text-muted-foreground">Total facturado por mes</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={serie} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
          <XAxis dataKey="mes" {...EJE} />
          <YAxis tickFormatter={ejeY} width={52} {...EJE} />
          <Tooltip content={<Tooltipe />} cursor={{ fill: "var(--color-surface-muted)" }} />
          <Bar
            dataKey="total"
            name="Ventas"
            fill="var(--color-chart-1)"
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </Tarjeta>
  );
}
