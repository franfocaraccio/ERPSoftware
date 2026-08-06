import { Boton, clasesBoton, Esqueleto, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus, Search, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import {
  etiquetaCondicionIva,
  etiquetaEstado,
  formatearCuit,
  formatearImporte,
} from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

interface FilaCliente {
  id: string;
  razonSocial: string;
  cuit: string | null;
  condicionIva: string;
  email: string | null;
  limiteCredito: string | null;
  estado: string;
}

const TONO_ESTADO = {
  activo: "exito",
  inactivo: "neutro",
  en_mora: "peligro",
} as const;

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, FilaCliente>();

const columnas = helper.columns([
  helper.accessor("razonSocial", {
    header: "Razón social",
    cell: (info) => (
      <Link
        to="/clientes/$clienteId"
        params={{ clienteId: info.row.original.id }}
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("cuit", {
    header: "CUIT",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearCuit(info.getValue())}</span>
    ),
  }),
  helper.accessor("condicionIva", {
    header: "Condición IVA",
    cell: (info) => (
      <span className="text-muted-foreground">{etiquetaCondicionIva(info.getValue())}</span>
    ),
  }),
  helper.accessor("email", {
    header: "Email",
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  helper.accessor("limiteCredito", {
    header: () => <span className="block text-right">Límite de crédito</span>,
    cell: (info) => (
      <span className="block text-right tabular text-muted-foreground">
        {formatearImporte(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("estado", {
    header: "Estado",
    cell: (info) => {
      const valor = info.getValue();
      return (
        <Insignia tono={TONO_ESTADO[valor as keyof typeof TONO_ESTADO] ?? "neutro"}>
          {etiquetaEstado(valor)}
        </Insignia>
      );
    },
  }),
]);

const SIN_DATOS: FilaCliente[] = [];

export function ListaClientes() {
  const trpc = useTRPC();
  const [busqueda, setBusqueda] = useState("");
  // Difiere el filtrado para no disparar una request por tecla.
  const busquedaDiferida = useDeferredValue(busqueda);

  const { data, isPending, isError, refetch } = useQuery(
    trpc.clientes.listar.queryOptions({
      busqueda: busquedaDiferida || undefined,
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  const table = useTable({
    features,
    columns: columnas,
    data: (data?.items as FilaCliente[] | undefined) ?? SIN_DATOS,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Padrón de clientes, condición fiscal y límite de crédito."
        acciones={
          <Link to="/clientes/nuevo" className={clasesBoton("primario", "sm")}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo cliente
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por razón social o CUIT"
            aria-label="Buscar clientes"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring"
          />
        </div>
        {!isPending && data && (
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {data.total === 1 ? "cliente" : "clientes"}
          </p>
        )}
      </div>

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar los clientes"
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
            aria-label="Cargando clientes"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <EstadoVacio
            icono={<Users className="size-8" aria-hidden="true" />}
            titulo={busquedaDiferida ? "Sin resultados" : "Todavía no hay clientes"}
            descripcion={
              busquedaDiferida
                ? `Ningún cliente coincide con "${busquedaDiferida}".`
                : "Cargá el primer cliente para empezar a facturar."
            }
            accion={
              busquedaDiferida ? (
                <Boton variante="secundario" tamano="sm" onClick={() => setBusqueda("")}>
                  Limpiar búsqueda
                </Boton>
              ) : (
                <Link to="/clientes/nuevo" className={clasesBoton("primario", "sm")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo cliente
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
