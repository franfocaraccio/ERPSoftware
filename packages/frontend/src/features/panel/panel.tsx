import { Boton, clasesBoton, Esqueleto, EstadoVacio, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Lock, Wallet } from "lucide-react";
import { lazy, Suspense } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";
import { DolarOficial } from "./dolar.js";
import type { FilaProyeccion } from "./graficos.js";
import { EsqueletoKpis, type Kpi, TarjetaKpi } from "./kpis.js";
import { AlertasCaja, LecturaDelMes } from "./lectura.js";

// Recharts pesa cerca de la mitad del bundle y solo se usa acá: se carga
// aparte, así el resto de los módulos no lo arrastran.
const GraficoSaldoProyectado = lazy(() =>
  import("./graficos.js").then((m) => ({ default: m.GraficoSaldoProyectado })),
);
const GraficoFlujoSemanal = lazy(() =>
  import("./graficos.js").then((m) => ({ default: m.GraficoFlujoSemanal })),
);
const GraficoVentas = lazy(() =>
  import("./graficos.js").then((m) => ({ default: m.GraficoVentas })),
);

function EsqueletoGrafico() {
  return <Esqueleto className="h-80 w-full" />;
}

/** Saldos por cuenta: el dato que la especificación pide ver primero. */
function SaldosPorCuenta({
  cuentas,
  consolidado,
}: {
  cuentas: { nombre: string; moneda: string; saldo: string }[];
  /** Lo calcula el servidor: acá no se suman importes con `number`. */
  consolidado: {
    dolares: string;
    cotizacion: string | null;
    fechaCotizacion: string | null;
    total: string;
  };
}) {
  if (cuentas.length === 0) {
    return null;
  }
  const hayDolares = consolidado.dolares !== "0.00";

  return (
    <Tarjeta className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Saldo por cuenta</h2>
        <p className="text-xs text-muted-foreground">
          Consolidado en pesos{" "}
          <span className="tabular font-medium text-foreground">
            {formatearImporte(consolidado.total)}
          </span>
        </p>
      </div>
      {hayDolares && (
        <p className="mb-2 text-xs text-muted-foreground">
          {consolidado.cotizacion
            ? `Incluye ${formatearImporte(consolidado.dolares, "USD")} al dólar oficial comprador de ${formatearImporte(consolidado.cotizacion)}${consolidado.fechaCotizacion ? ` (${formatearFecha(consolidado.fechaCotizacion)})` : ""}.`
            : "No incluye los dólares: no se pudo traer la cotización."}
        </p>
      )}
      <ul className="divide-y divide-border">
        {cuentas.map((c) => {
          const negativo = c.saldo.startsWith("-");
          return (
            <li key={c.nombre} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate text-muted-foreground">
                {c.nombre}
                <span className="ml-1.5 text-xs text-muted-foreground/70">{c.moneda}</span>
              </span>
              <span
                className={`shrink-0 tabular font-medium ${negativo ? "text-danger" : "text-foreground"}`}
              >
                {formatearImporte(c.saldo, c.moneda as "ARS" | "USD")}
              </span>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

export function Panel() {
  const trpc = useTRPC();
  const { data, isPending, isError, refetch } = useQuery(trpc.financiero.resumen.queryOptions());

  if (isError) {
    return (
      <>
        <EncabezadoPagina titulo="Panel" />
        <Tarjeta>
          <EstadoVacio
            titulo="No se pudo cargar el panel"
            descripcion="Revisá que el servidor esté disponible y volvé a intentar."
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        </Tarjeta>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <EncabezadoPagina titulo="Panel" descripcion="Indicadores y proyección de caja." />
        <EsqueletoKpis />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Esqueleto className="h-80 w-full" />
          <Esqueleto className="h-80 w-full" />
        </div>
      </>
    );
  }

  // El acceso a los indicadores es por persona y lo decide el Administrador.
  // El servidor no manda los datos; acá se explica por qué la pantalla está
  // vacía, en vez de mostrar todo en cero.
  if (!data.habilitado) {
    return (
      <>
        <EncabezadoPagina titulo="Panel" />
        <Tarjeta>
          <EstadoVacio
            icono={<Lock className="size-8" aria-hidden="true" />}
            titulo="Tu cuenta no tiene habilitados los indicadores"
            descripcion="Los módulos del menú siguen disponibles. Si necesitás ver el panel, pedíselo al Administrador de la empresa."
          />
        </Tarjeta>
      </>
    );
  }

  const sinDatos =
    data.saldoPorCuenta.length === 0 && data.kpis.every((k) => k.semaforo === "sin_datos");

  return (
    <>
      <EncabezadoPagina
        titulo="Panel"
        descripcion="Indicadores del negocio y proyección de caja a trece semanas."
        acciones={<DolarOficial />}
      />

      {sinDatos ? (
        <Tarjeta>
          <EstadoVacio
            icono={<LayoutDashboard className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay datos para mostrar"
            descripcion="Cargá cuentas, comprobantes e impuestos y el panel se arma solo."
            accion={
              <Link to="/tesoreria" className={clasesBoton("primario", "sm")}>
                <Wallet className="size-4" aria-hidden="true" />
                Empezar por Tesorería
              </Link>
            }
          />
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          <AlertasCaja alertas={data.alertas} />
          <LecturaDelMes />
          <section aria-label="Indicadores">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(data.kpis as Kpi[]).map((kpi) => (
                <TarjetaKpi key={kpi.id} kpi={kpi} />
              ))}
            </div>
          </section>

          <Suspense
            fallback={
              <div className="grid gap-4 lg:grid-cols-2">
                <EsqueletoGrafico />
                <EsqueletoGrafico />
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <GraficoSaldoProyectado
                datos={data.proyeccion as FilaProyeccion[]}
                minimoOperativo={data.minimoOperativo}
                cobrosVencidos={data.cobrosVencidos}
                pagosVencidos={data.pagosVencidos}
              />
              <GraficoFlujoSemanal datos={data.proyeccion as FilaProyeccion[]} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <GraficoVentas datos={data.ventasPorMes} />
              <SaldosPorCuenta cuentas={data.saldoPorCuenta} consolidado={data.consolidado} />
            </div>
          </Suspense>
        </div>
      )}
    </>
  );
}
