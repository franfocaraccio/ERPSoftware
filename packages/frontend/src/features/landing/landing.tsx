import { Boton, clasesBoton, Tarjeta, ToggleTema } from "@erp/design-system";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  Building2,
  CircleCheck,
  Clock,
  FileText,
  Landmark,
  Receipt,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useSession } from "../../lib/auth.js";
import { LeyendaFlujo, MuestraFlujo, MuestraProyeccion } from "./graficos-muestra.js";

const MODULOS = [
  {
    Icono: Users,
    titulo: "Clientes y cobranzas",
    texto:
      "Cuenta corriente por cliente, saldos al día y cuánto tardás realmente en cobrar cada factura.",
  },
  {
    Icono: Building2,
    titulo: "Proveedores y compras",
    texto:
      "Comprobantes de compra con vencimientos propios, para saber qué se paga esta semana y qué puede esperar.",
  },
  {
    Icono: Boxes,
    titulo: "Stock",
    texto:
      "Productos con costo, precio y stock mínimo. El sistema avisa qué está por debajo antes de que falte.",
  },
  {
    Icono: Wallet,
    titulo: "Tesorería",
    texto:
      "Cuentas en pesos y en dólares, movimientos y cheques con su estado. El saldo se calcula, no se carga a mano.",
  },
  {
    Icono: Receipt,
    titulo: "Impuestos",
    texto:
      "Las obligaciones con su vencimiento y su pago. Lo vencido aparece en el panel sin que lo tengas que buscar.",
  },
  {
    Icono: FileText,
    titulo: "Comprobantes de venta",
    texto:
      "Emisión con numeración por punto de venta, IVA discriminado por alícuota y letra A, B o C según corresponda.",
  },
];

const DIFERENCIALES = [
  {
    Icono: ShieldCheck,
    titulo: "Los datos de cada empresa quedan adentro",
    texto:
      "El aislamiento no depende de que la aplicación se acuerde de filtrar: lo garantiza la base de datos, empresa por empresa. Un contador puede llevar varias sin que se mezclen.",
  },
  {
    Icono: TrendingUp,
    titulo: "Números que cierran",
    texto:
      "Los importes se calculan con precisión decimal y el redondeo fiscal se aplica una sola vez por alícuota, así el total de la factura cierra exacto contra el detalle.",
  },
  {
    Icono: Landmark,
    titulo: "Preparado para facturar ante ARCA",
    texto:
      "El modelo de comprobantes ya contempla CAE, puntos de venta y numeración sin huecos. La emisión electrónica es la etapa que estamos desarrollando.",
    proximamente: true,
  },
];

/** Los mismos indicadores que muestra el panel real, con datos de ejemplo. */
const KPIS_MUESTRA = [
  {
    etiqueta: "Liquidez corriente",
    valor: "1,40",
    estado: "ok" as const,
    detalle: "Caja más cobranzas sobre lo que hay que pagar",
  },
  {
    etiqueta: "Días de cobro",
    valor: "19 días",
    estado: "ok" as const,
    detalle: "Promedio ponderado sobre las ventas del período",
  },
  {
    etiqueta: "Impuestos vencidos",
    valor: "1",
    estado: "alerta" as const,
    detalle: "Obligaciones cuyo vencimiento ya pasó",
  },
];

const ESTADO_KPI = {
  ok: { Icono: CircleCheck, etiqueta: "En rango", clase: "text-success" },
  alerta: { Icono: TriangleAlert, etiqueta: "Atención", clase: "text-danger" },
};

function TarjetaKpiMuestra({ kpi }: { kpi: (typeof KPIS_MUESTRA)[number] }) {
  const { Icono, etiqueta, clase } = ESTADO_KPI[kpi.estado];
  return (
    <Tarjeta className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {kpi.etiqueta}
        </p>
        <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${clase}`}>
          <Icono className="size-3.5" aria-hidden="true" />
          {etiqueta}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{kpi.valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{kpi.detalle}</p>
    </Tarjeta>
  );
}

/**
 * Botón de contacto. Todavía no manda nada: en lugar de dejarlo muerto —el
 * usuario haría clic y no pasaría nada— revela el estado real del canal.
 */
function BotonContacto({ tamano = "md" }: { tamano?: "sm" | "md" }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <Boton
        variante="secundario"
        tamano={tamano}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        Contactanos
      </Boton>
      {abierto && (
        <p role="status" className="max-w-xs text-center text-xs text-muted-foreground">
          Estamos terminando de armar el canal de contacto. Muy pronto vas a poder escribirnos por
          mail o por WhatsApp desde acá.
        </p>
      )}
    </div>
  );
}

export function Landing() {
  const { data: sesion } = useSession();

  /**
   * El botón dice siempre "Ingresar", con sesión o sin ella.
   *
   * Antes alternaba con "Ir al ERP" según hubiera sesión, y como `useSession`
   * resuelve contra el servidor, en cada carga de la portada el botón se
   * dibujaba primero como "Ingresar" y cambiaba solo al volver la respuesta.
   * Una etiqueta fija no puede parpadear.
   *
   * El destino sí sigue dependiendo de la sesión: quien ya entró va derecho al
   * ERP y no vuelve a pasar por el login.
   */
  const destino = sesion?.user.role === "admin" ? "/admin" : "/panel";

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">ERP PyME</p>
            <p className="text-xs text-muted-foreground">Gestión integral</p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleTema />
            <Link to={destino} className={clasesBoton("primario", "sm")}>
              Ingresar
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* --- Hero --- */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">
              Para PyMEs argentinas que ya no entran en una planilla
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              Las cuentas de tu empresa, ordenadas y al día
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
              Clientes, proveedores, stock, tesorería e impuestos en un mismo lugar. Con los
              indicadores que de verdad importan y proyección de caja para ver el problema antes de
              tenerlo encima.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-start">
              <Link to={destino} className={clasesBoton()}>
                Ingresar
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <BotonContacto />
            </div>
          </div>
        </section>

        {/* --- Muestra del panel --- */}
        <section aria-labelledby="muestra" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-6 text-center">
            <h2 id="muestra" className="text-xl font-semibold tracking-tight text-foreground">
              Así se ve tu operación
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              El panel se arma solo con lo que vas cargando. Estos son datos de muestra de una
              empresa de ejemplo.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {KPIS_MUESTRA.map((kpi) => (
              <TarjetaKpiMuestra key={kpi.etiqueta} kpi={kpi} />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Tarjeta className="p-5">
              <h3 className="text-sm font-semibold text-foreground">Saldo proyectado</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Trece semanas hacia adelante, con tu mínimo operativo marcado
              </p>
              <MuestraProyeccion />
              <p className="mt-3 text-xs text-danger">
                Sabés en qué semana te quedás corto, con tiempo para hacer algo.
              </p>
            </Tarjeta>

            <Tarjeta className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Cobros y pagos</h3>
                  <p className="text-xs text-muted-foreground">Lo que entra y sale cada semana</p>
                </div>
                <LeyendaFlujo />
              </div>
              <MuestraFlujo />
              <p className="mt-3 text-xs text-muted-foreground">
                Sale de los vencimientos reales de tus facturas, no de un promedio.
              </p>
            </Tarjeta>
          </div>
        </section>

        {/* --- Módulos --- */}
        <section
          aria-labelledby="modulos"
          className="border-y border-border bg-surface/60 py-14 sm:py-16"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 max-w-xl">
              <h2 id="modulos" className="text-xl font-semibold tracking-tight text-foreground">
                Qué podés hacer
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Seis módulos que comparten los mismos datos: lo que cargás en uno se refleja en el
                resto sin volver a escribirlo.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map(({ Icono, titulo, texto }) => (
                <li key={titulo}>
                  <Tarjeta className="h-full p-5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                      <Icono className="size-4.5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">{titulo}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{texto}</p>
                  </Tarjeta>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Diferenciales --- */}
        <section aria-labelledby="fundamentos" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2
            id="fundamentos"
            className="mb-8 max-w-xl text-xl font-semibold tracking-tight text-foreground"
          >
            Lo que hay abajo
          </h2>
          <ul className="grid gap-8 lg:grid-cols-3">
            {DIFERENCIALES.map(({ Icono, titulo, texto, proximamente }) => (
              <li key={titulo}>
                <div className="flex items-center gap-2">
                  <Icono className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
                {proximamente && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    En desarrollo
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* --- Cierre --- */}
        <section className="border-t border-border bg-surface/60 py-14 sm:py-16">
          <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
              ¿Lo querés probar con los números de tu empresa?
            </h2>
            {/* Acá va solo contacto: para entrar ya están el header y el hero. */}
            <div className="mt-7 flex justify-center">
              <BotonContacto />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>ERP PyME · Gestión integral para pequeñas y medianas empresas</p>
          <p>Hecho en Argentina</p>
        </div>
      </footer>
    </div>
  );
}
