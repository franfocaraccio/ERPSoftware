import { Boton, clasesBoton, Esqueleto, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { AlertTriangle, Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import {
  formatearFecha,
  formatearImporte,
  formatearPeriodo,
  formatearPorcentaje,
} from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

type EstadoImpuesto = "pagado" | "vencido" | "pendiente";

interface FilaImpuesto {
  id: string;
  tipo: string;
  periodo: string;
  baseImponible: string;
  alicuota: string;
  importeDeterminado: string;
  importePagado: string;
  saldo: string;
  fechaVencimiento: string;
  estado: EstadoImpuesto;
}

const ETIQUETAS_TIPO: Record<string, string> = {
  iva: "IVA",
  iibb: "IIBB",
  ganancias: "Ganancias",
  monotributo: "Monotributo",
  otros: "Otros",
};

const TONO_ESTADO = { pagado: "exito", vencido: "peligro", pendiente: "advertencia" } as const;
const ETIQUETA_ESTADO = { pagado: "Pagado", vencido: "Vencido", pendiente: "Pendiente" } as const;

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, FilaImpuesto>();

const columnas = helper.columns([
  helper.accessor("tipo", {
    header: "Impuesto",
    cell: (info) => (
      <Link
        to="/impuestos/$impuestoId"
        params={{ impuestoId: info.row.original.id }}
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {ETIQUETAS_TIPO[info.getValue()] ?? info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("periodo", {
    header: "Período",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearPeriodo(info.getValue())}</span>
    ),
  }),
  helper.accessor("baseImponible", {
    header: () => <span className="block text-right">Base imponible</span>,
    cell: (info) => (
      <span className="block text-right tabular text-muted-foreground">
        {formatearImporte(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("alicuota", {
    header: () => <span className="block text-right">Alícuota</span>,
    cell: (info) => (
      <span className="block text-right tabular text-muted-foreground">
        {formatearPorcentaje(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("importeDeterminado", {
    header: () => <span className="block text-right">Determinado</span>,
    cell: (info) => (
      <span className="block text-right tabular text-foreground">
        {formatearImporte(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("saldo", {
    header: () => <span className="block text-right">Saldo</span>,
    cell: (info) => {
      const impago = info.getValue() !== "0.00";
      return (
        <span
          className={`block text-right tabular ${impago ? "font-medium text-foreground" : "text-muted-foreground"}`}
        >
          {formatearImporte(info.getValue())}
        </span>
      );
    },
  }),
  helper.accessor("fechaVencimiento", {
    header: "Vencimiento",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearFecha(info.getValue())}</span>
    ),
  }),
  helper.accessor("estado", {
    header: "Estado",
    cell: (info) => {
      const estado = info.getValue();
      return <Insignia tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Insignia>;
    },
  }),
]);

const SIN_DATOS: FilaImpuesto[] = [];

const TIPOS = ["iva", "iibb", "ganancias", "monotributo", "otros"] as const;

export function ListaImpuestos() {
  const trpc = useTRPC();
  const [tipo, setTipo] = useState<(typeof TIPOS)[number] | "">("");
  const [soloImpagos, setSoloImpagos] = useState(false);

  const { data, isPending, isError, refetch } = useQuery(
    trpc.impuestos.listar.queryOptions({
      tipo: tipo || undefined,
      soloImpagos,
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  const table = useTable({
    features,
    columns: columnas,
    data: (data?.items as FilaImpuesto[] | undefined) ?? SIN_DATOS,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Impuestos"
        descripcion="Obligaciones fiscales, vencimientos y saldos pendientes."
        acciones={
          <Link to="/impuestos/nueva" className={clasesBoton("primario", "sm")}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva obligación
          </Link>
        }
      />

      {!isPending && data && data.cantidadVencidos > 0 && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Hay <span className="tabular font-medium">{data.cantidadVencidos}</span>{" "}
            {data.cantidadVencidos === 1 ? "obligación vencida" : "obligaciones vencidas"}.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number] | "")}
          aria-label="Filtrar por tipo de impuesto"
          className="h-10 cursor-pointer rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-ring"
        >
          <option value="">Todos los impuestos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETAS_TIPO[t]}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={soloImpagos}
            onChange={(e) => setSoloImpagos(e.target.checked)}
            className="size-4 cursor-pointer rounded border-border-strong accent-primary"
          />
          Solo impagas
        </label>

        {!isPending && data && (
          <p className="ml-auto text-xs text-muted-foreground">
            <span className="tabular">{data.total}</span>{" "}
            {data.total === 1 ? "obligación" : "obligaciones"} · Adeudado{" "}
            <span className="font-medium tabular text-foreground">
              {formatearImporte(data.totalAdeudado)}
            </span>
          </p>
        )}
      </div>

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar las obligaciones"
            descripcion="Revisá que el servidor esté disponible y volvé a intentar."
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        ) : isPending ? (
          <div
            className="space-y-2 p-4"
            role="status"
            aria-busy="true"
            aria-label="Cargando obligaciones"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <EstadoVacio
            icono={<Receipt className="size-8" aria-hidden="true" />}
            titulo={
              soloImpagos || tipo
                ? "Sin obligaciones para ese filtro"
                : "Todavía no hay obligaciones"
            }
            descripcion={
              soloImpagos
                ? "No hay obligaciones pendientes ni vencidas."
                : "Cargá tus obligaciones para no perder de vista los vencimientos."
            }
            accion={
              soloImpagos || tipo ? (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => {
                    setSoloImpagos(false);
                    setTipo("");
                  }}
                >
                  Ver todas
                </Boton>
              ) : (
                <Link to="/impuestos/nueva" className={clasesBoton("primario", "sm")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva obligación
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {table.getHeaderGroups().map((grupo) => (
                  <tr key={grupo.id} className="border-b border-border">
                    {grupo.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
