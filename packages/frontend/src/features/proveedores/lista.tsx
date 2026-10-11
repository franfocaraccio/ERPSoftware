import { participacion } from "@erp/core/kpis";
import { Money } from "@erp/core/money";
import {
  Boton,
  clasesBoton,
  cn,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Tarjeta,
} from "@erp/design-system";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Building2, Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { BotonExportar } from "../../components/boton-exportar.js";
import {
  ariaSort,
  type Direccion,
  EncabezadoOrdenable,
  FiltroSelector,
} from "../../components/filtros.js";
import { EncabezadoPagina } from "../../components/layout.js";
import {
  EsqueletoCartera,
  type ResumenCartera,
  TarjetasCartera,
} from "../../components/resumen-cartera.js";
import { SelectorDensidad } from "../../components/selector-densidad.js";
import { useModoLectura } from "../../components/sesion.js";
import { clasesCelda, clasesEncabezado, useDensidad } from "../../lib/densidad.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import {
  etiquetaCondicionIva,
  formatearCuit,
  formatearFecha,
  formatearImporte,
  formatearPorcentaje,
} from "../../lib/formato.js";
import { alineadoDerecha, clasesColumna } from "../../lib/tabla.js";
import { useTRPC } from "../../lib/trpc.js";

interface FilaProveedor {
  id: string;
  razonSocial: string;
  cuit: string | null;
  condicionIva: string;
  rubro: string | null;
  condicionPagoDias: number;
  saldoAPagar: string;
  proximoVencimiento: string | null;
  tieneMonedaExtranjera: boolean;
}

/**
 * La fila de la tabla: el proveedor más cuánto pesa dentro del total a pagar.
 *
 * La concentración no viene del servidor porque es relativa al total de los
 * filtros activos, que lo trae el resumen: se arma acá, donde conviven los dos.
 */
interface FilaConPeso extends FilaProveedor {
  /** % del total a pagar. null si no se le debe nada o no hay total. */
  concentracion: string | null;
  concentracionAlerta: boolean;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, FilaConPeso>();

const columnas = helper.columns([
  helper.accessor("razonSocial", {
    header: "Razón social",
    cell: (info) => (
      <Link
        to="/proveedores/$proveedorId"
        params={{ proveedorId: info.row.original.id }}
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("cuit", {
    meta: { secundaria: true },
    header: "CUIT",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearCuit(info.getValue())}</span>
    ),
  }),
  helper.accessor("condicionIva", {
    meta: { secundaria: true },
    header: "Condición IVA",
    cell: (info) => (
      <span className="text-muted-foreground">{etiquetaCondicionIva(info.getValue())}</span>
    ),
  }),
  helper.accessor("rubro", {
    meta: { secundaria: true, ancha: true },
    header: "Rubro",
    cell: (info) => (
      <span className="text-muted-foreground" title={info.getValue() ?? undefined}>
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  helper.accessor("condicionPagoDias", {
    header: "Plazo",
    meta: { alineado: "derecha", secundaria: true },
    cell: (info) => (
      <span className="block text-right tabular text-muted-foreground">
        {info.getValue()} {info.getValue() === 1 ? "día" : "días"}
      </span>
    ),
  }),
  helper.accessor("proximoVencimiento", {
    meta: { secundaria: true },
    header: "Próx. vencimiento",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearFecha(info.getValue())}</span>
    ),
  }),
  helper.accessor("saldoAPagar", {
    header: "Saldo a pagar",
    meta: { alineado: "derecha" },
    cell: (info) => {
      const valor = info.getValue();
      const hayDeuda = valor !== "0.00" && !valor.startsWith("-");
      return (
        <span
          className={`block text-right tabular ${hayDeuda ? "font-medium text-foreground" : "text-muted-foreground"}`}
        >
          {formatearImporte(valor)}
        </span>
      );
    },
  }),
  helper.accessor("concentracion", {
    header: "Concentración",
    meta: { alineado: "derecha" },
    cell: (info) => {
      const valor = info.getValue();
      if (valor === null) {
        return <span className="block text-right text-muted-foreground">—</span>;
      }
      const texto = formatearPorcentaje(valor);
      return (
        <span className="block text-right">
          {info.row.original.concentracionAlerta ? (
            <Insignia tono="advertencia">{texto}</Insignia>
          ) : (
            <span className="tabular text-muted-foreground">{texto}</span>
          )}
        </span>
      );
    },
  }),
]);

const COLUMNAS_EXPORT: ColumnaExport<FilaProveedor>[] = [
  { encabezado: "Razón social", valor: (p) => p.razonSocial, tipo: "texto", ancho: 32 },
  { encabezado: "CUIT", valor: (p) => p.cuit, tipo: "codigo", ancho: 14 },
  {
    encabezado: "Condición IVA",
    valor: (p) => etiquetaCondicionIva(p.condicionIva),
    tipo: "texto",
  },
  { encabezado: "Rubro", valor: (p) => p.rubro, tipo: "texto" },
  { encabezado: "Plazo de pago (días)", valor: (p) => p.condicionPagoDias, tipo: "numero" },
  { encabezado: "Saldo a pagar", valor: (p) => p.saldoAPagar, tipo: "dinero" },
  { encabezado: "Próx. vencimiento", valor: (p) => p.proximoVencimiento, tipo: "fecha" },
];

const SIN_DATOS: FilaProveedor[] = [];

/** Columna de la tabla → campo por el que ordena el servidor. */
const CAMPOS_ORDENABLES: Record<string, string | undefined> = {
  razonSocial: "razonSocial",
  cuit: "cuit",
  condicionIva: "condicionIva",
  rubro: "rubro",
  condicionPagoDias: "condicionPagoDias",
};

const ETIQUETA_COLUMNA: Record<string, string> = {
  razonSocial: "Razón social",
  cuit: "CUIT",
  condicionIva: "Condición IVA",
  rubro: "Rubro",
  condicionPagoDias: "Plazo",
  proximoVencimiento: "Próx. vencimiento",
  saldoAPagar: "Saldo a pagar",
  concentracion: "Concentración",
};

export function ListaProveedores() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const soloLectura = useModoLectura();
  const [condicionIva, setCondicionIva] = useState("");
  const [orden, setOrden] = useState("razonSocial");
  const [direccion, setDireccion] = useState<Direccion>("asc");
  const ordenar = (campo: string, dir: Direccion) => {
    setOrden(campo);
    setDireccion(dir);
  };
  const [busqueda, setBusqueda] = useState("");
  const busquedaDiferida = useDeferredValue(busqueda);
  const [densidad, setDensidad] = useDensidad("proveedores");

  /** Los mismos filtros alimentan el listado y el resumen: si divergen, el
   * porcentaje de cada fila se calcularía contra un total que no es el suyo. */
  const filtros = {
    busqueda: busquedaDiferida || undefined,
    ...(condicionIva ? { condicionIva: condicionIva as "exento" } : {}),
  };

  const { data, isPending, isError, refetch } = useQuery(
    trpc.proveedores.listar.queryOptions({
      ...filtros,
      orden: orden as "razonSocial",
      direccion,
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  const { data: resumen, isError: resumenFallo } = useQuery(
    trpc.proveedores.resumen.queryOptions(filtros),
  );

  const filas = useMemo<FilaConPeso[]>(() => {
    const items = (data?.items as FilaProveedor[] | undefined) ?? SIN_DATOS;
    const total = resumen ? Money.desdeString(resumen.totalAPagar, "ARS") : null;
    const umbral = resumen ? Number(resumen.umbralConcentracion) : null;

    return items.map((proveedor) => {
      const saldo = Money.desdeString(proveedor.saldoAPagar, "ARS");
      // Un proveedor al que le pagaste de más no concentra nada.
      const concentracion = total && saldo.esPositivo() ? participacion(saldo, total) : null;
      return {
        ...proveedor,
        concentracion,
        concentracionAlerta:
          concentracion !== null && umbral !== null && Number(concentracion) > umbral,
      };
    });
  }, [data?.items, resumen]);

  const table = useTable({
    features,
    columns: columnas,
    data: filas,
  });

  /** Todo lo que matchea los filtros activos, no la página visible. */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.proveedores.exportar.queryOptions({
        busqueda: busquedaDiferida || undefined,
        ...(condicionIva ? { condicionIva: condicionIva as "exento" } : {}),
        orden: orden as "razonSocial",
        direccion,
      }),
      // staleTime 0 va después del spread para que gane: un archivo que el
      // usuario va a guardar no puede salir de la caché. El listado tolera 30s
      // de desfase; una exportación no.
      staleTime: 0,
    });
    return { items: datos.items as FilaProveedor[], truncado: datos.truncado };
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Padrón de proveedores, condiciones de pago y saldo pendiente."
        acciones={
          soloLectura ? null : (
            <Link to="/proveedores/nuevo" className={clasesBoton("primario", "sm")}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo proveedor
            </Link>
          )
        }
      />

      {/* Si el resumen falla, el listado sigue siendo útil: se omiten las
          tarjetas en vez de dejar un esqueleto girando para siempre. */}
      {resumen ? (
        <TarjetasCartera
          resumen={
            {
              total: resumen.totalAPagar,
              contrapartes: resumen.acreedores,
              concentracion: resumen.concentracion,
              umbralConcentracion: resumen.umbralConcentracion,
              semaforo: resumen.semaforo,
              hayMonedaExtranjera: resumen.hayMonedaExtranjera,
            } satisfies ResumenCartera
          }
          textos={{
            total: "Total a pagar",
            detalle: (n) => `Se le debe a ${n} ${n === 1 ? "proveedor" : "proveedores"}`,
            vacio: "Ningún proveedor con saldo pendiente",
          }}
        />
      ) : resumenFallo ? null : (
        <EsqueletoCartera />
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FiltroSelector
          etiqueta="Condición IVA"
          valor={condicionIva}
          opciones={[
            { id: "responsable_inscripto" as const, etiqueta: "Resp. inscripto" },
            { id: "monotributo" as const, etiqueta: "Monotributo" },
            { id: "exento" as const, etiqueta: "Exento" },
            { id: "consumidor_final" as const, etiqueta: "Consumidor final" },
          ]}
          onCambio={setCondicionIva}
        />
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
            aria-label="Buscar proveedores"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!isPending && data && (
            <p className="text-xs text-muted-foreground tabular">
              {data.total} {data.total === 1 ? "proveedor" : "proveedores"}
            </p>
          )}
          <SelectorDensidad valor={densidad} onCambio={setDensidad} />
        </div>
      </div>

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar los proveedores"
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
            aria-label="Cargando proveedores"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <EstadoVacio
            icono={<Building2 className="size-8" aria-hidden="true" />}
            titulo={busquedaDiferida ? "Sin resultados" : "Todavía no hay proveedores"}
            descripcion={
              busquedaDiferida
                ? `Ningún proveedor coincide con "${busquedaDiferida}".`
                : "Cargá tus proveedores para registrar compras y programar pagos."
            }
            accion={
              busquedaDiferida ? (
                <Boton variante="secundario" tamano="sm" onClick={() => setBusqueda("")}>
                  Limpiar búsqueda
                </Boton>
              ) : soloLectura ? null : (
                <Link to="/proveedores/nuevo" className={clasesBoton("primario", "sm")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo proveedor
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
                      const derecha = alineadoDerecha(header.column.columnDef.meta);
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={ordenable ? ariaSort(ordenable, orden, direccion) : undefined}
                          className={cn(
                            clasesEncabezado(densidad),
                            "text-xs font-medium tracking-wide text-muted-foreground uppercase",
                            derecha ? "text-right" : "text-left",
                            clasesColumna(header.column.columnDef.meta),
                          )}
                        >
                          {header.isPlaceholder ? null : ordenable ? (
                            <EncabezadoOrdenable
                              etiqueta={ETIQUETA_COLUMNA[header.column.id] ?? header.column.id}
                              campo={ordenable}
                              ordenActual={orden}
                              direccion={direccion}
                              onOrdenar={ordenar}
                              alineado={derecha ? "derecha" : "izquierda"}
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
                      <td
                        key={cell.id}
                        className={cn(
                          clasesCelda(densidad),
                          "align-middle whitespace-nowrap",
                          clasesColumna(cell.column.columnDef.meta),
                        )}
                      >
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

      {!isPending && !isError && table.getRowModel().rows.length > 0 && (
        <div className="mt-3 flex justify-end">
          <BotonExportar
            traerFilas={traerParaExportar}
            columnas={COLUMNAS_EXPORT}
            nombre="proveedores"
          />
        </div>
      )}
    </>
  );
}
