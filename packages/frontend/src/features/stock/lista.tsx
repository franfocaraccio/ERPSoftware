import { Boton, clasesBoton, Esqueleto, EstadoVacio, Insignia, Tarjeta } from "@erp/design-system";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Boxes, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { ariaSort, type Direccion, EncabezadoOrdenable } from "../../components/filtros.js";
import { EncabezadoPagina } from "../../components/layout.js";
import { useModoLectura } from "../../components/sesion.js";
import { formatearCantidad, formatearImporte, formatearPorcentaje } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

interface FilaProducto {
  id: string;
  sku: string;
  descripcion: string;
  categoria: string | null;
  proveedorNombre: string | null;
  stockActual: string;
  stockMinimo: string;
  estado: "ok" | "reponer";
  valorizacion: string;
  margenBruto: string | null;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, FilaProducto>();

const columnas = helper.columns([
  helper.accessor("sku", {
    header: "SKU",
    cell: (info) => (
      <Link
        to="/stock/$productoId"
        params={{ productoId: info.row.original.id }}
        className="font-medium tabular text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("descripcion", {
    header: "Descripción",
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  helper.accessor("categoria", {
    header: "Categoría",
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  helper.accessor("proveedorNombre", {
    header: "Proveedor",
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  helper.accessor("stockActual", {
    header: () => <span className="block text-right">Stock</span>,
    cell: (info) => (
      <span className="block text-right tabular text-foreground">
        {formatearCantidad(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("stockMinimo", {
    header: () => <span className="block text-right">Mínimo</span>,
    cell: (info) => (
      <span className="block text-right tabular text-muted-foreground">
        {formatearCantidad(info.getValue())}
      </span>
    ),
  }),
  helper.accessor("estado", {
    header: "Estado",
    cell: (info) =>
      info.getValue() === "reponer" ? (
        <Insignia tono="advertencia">Reponer</Insignia>
      ) : (
        <Insignia tono="exito">OK</Insignia>
      ),
  }),
  helper.accessor("margenBruto", {
    header: () => <span className="block text-right">Margen</span>,
    cell: (info) => {
      const valor = info.getValue();
      return (
        <span className="block text-right tabular text-muted-foreground">
          {valor === null ? "—" : formatearPorcentaje(valor)}
        </span>
      );
    },
  }),
  helper.accessor("valorizacion", {
    header: () => <span className="block text-right">Valorización</span>,
    cell: (info) => (
      <span className="block text-right tabular text-foreground">
        {formatearImporte(info.getValue())}
      </span>
    ),
  }),
]);

const SIN_DATOS: FilaProducto[] = [];

/** Columna de la tabla → campo por el que ordena el servidor. */
const CAMPOS_ORDENABLES: Record<string, string | undefined> = {
  sku: "sku",
  descripcion: "descripcion",
  categoria: "categoria",
  costoUnitario: "costoUnitario",
  precioVenta: "precioVenta",
  stockActual: "stockActual",
};

const ETIQUETA_COLUMNA: Record<string, string> = {
  sku: "SKU",
  descripcion: "Descripción",
  categoria: "Categoría",
  costoUnitario: "Costo",
  precioVenta: "Precio",
  stockActual: "Stock",
};

export function ListaStock() {
  const trpc = useTRPC();
  const soloLectura = useModoLectura();
  const [orden, setOrden] = useState("sku");
  const [direccion, setDireccion] = useState<Direccion>("asc");
  const ordenar = (campo: string, dir: Direccion) => {
    setOrden(campo);
    setDireccion(dir);
  };
  const [busqueda, setBusqueda] = useState("");
  const [soloReponer, setSoloReponer] = useState(false);
  const busquedaDiferida = useDeferredValue(busqueda);

  const { data, isPending, isError, refetch } = useQuery(
    trpc.stock.listar.queryOptions({
      busqueda: busquedaDiferida || undefined,
      soloReponer,
      orden: orden as "sku",

      direccion,

      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  const table = useTable({
    features,
    columns: columnas,
    data: (data?.items as FilaProducto[] | undefined) ?? SIN_DATOS,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Stock"
        descripcion="Productos, niveles de reposición y capital inmovilizado."
        acciones={
          soloLectura ? null : (
            <Link to="/stock/nuevo" className={clasesBoton("primario", "sm")}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo producto
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por SKU o descripción"
            aria-label="Buscar productos"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={soloReponer}
            onChange={(e) => setSoloReponer(e.target.checked)}
            className="size-4 cursor-pointer rounded border-border-strong accent-primary"
          />
          Solo los que hay que reponer
        </label>

        {!isPending && data && (
          <p className="ml-auto text-xs text-muted-foreground">
            <span className="tabular">{data.total}</span>{" "}
            {data.total === 1 ? "producto" : "productos"} · Capital inmovilizado{" "}
            <span className="font-medium tabular text-foreground">
              {formatearImporte(data.valorizacionTotal)}
            </span>
          </p>
        )}
      </div>

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudo cargar el stock"
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
            aria-label="Cargando productos"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <EstadoVacio
            icono={<Boxes className="size-8" aria-hidden="true" />}
            titulo={
              soloReponer
                ? "No hay productos para reponer"
                : busquedaDiferida
                  ? "Sin resultados"
                  : "Todavía no hay productos"
            }
            descripcion={
              soloReponer
                ? "Todos los productos están por encima de su stock mínimo."
                : busquedaDiferida
                  ? `Ningún producto coincide con "${busquedaDiferida}".`
                  : "Cargá tu catálogo para controlar stock y valorización."
            }
            accion={
              soloReponer ? (
                <Boton variante="secundario" tamano="sm" onClick={() => setSoloReponer(false)}>
                  Ver todos
                </Boton>
              ) : busquedaDiferida ? (
                <Boton variante="secundario" tamano="sm" onClick={() => setBusqueda("")}>
                  Limpiar búsqueda
                </Boton>
              ) : soloLectura ? null : (
                <Link to="/stock/nuevo" className={clasesBoton("primario", "sm")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo producto
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
                    {grupo.headers.map((header) => {
                      const ordenable = CAMPOS_ORDENABLES[header.column.id];
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={ordenable ? ariaSort(ordenable, orden, direccion) : undefined}
                          className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        >
                          {header.isPlaceholder ? null : ordenable ? (
                            <EncabezadoOrdenable
                              etiqueta={ETIQUETA_COLUMNA[header.column.id] ?? header.column.id}
                              campo={ordenable}
                              ordenActual={orden}
                              direccion={direccion}
                              onOrdenar={ordenar}
                            />
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      );
                    })}
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
