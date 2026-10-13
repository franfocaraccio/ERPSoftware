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
import {
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Plus, Search, Users } from "lucide-react";
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
import { SelectorColumnas } from "../../components/selector-columnas.js";
import { SelectorDensidad } from "../../components/selector-densidad.js";
import { useModoLectura } from "../../components/sesion.js";
import { CeldaVencimiento } from "../../components/vencimiento.js";
import { aVisibilidad, useColumnasEscondidas } from "../../lib/columnas.js";
import { clasesCelda, clasesEncabezado, useDensidad } from "../../lib/densidad.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import {
  etiquetaCondicionIva,
  etiquetaEstado,
  formatearCuit,
  formatearImporte,
  formatearPorcentaje,
} from "../../lib/formato.js";
import { alineadoDerecha, clasesColumna } from "../../lib/tabla.js";
import { useTRPC } from "../../lib/trpc.js";

interface FilaCliente {
  id: string;
  razonSocial: string;
  cuit: string | null;
  condicionIva: string;
  email: string | null;
  limiteCredito: string | null;
  estado: string;
  saldo: string;
  proximoVencimiento: string | null;
  /** Calculado: deuda vencida hace más que el umbral de Parámetros. */
  enMora: boolean;
  excedeLimite: boolean;
  tieneMonedaExtranjera: boolean;
}

/** Lo que se muestra como estado: la mora calculada gana sobre lo guardado. */
function estadoVisible(c: Pick<FilaCliente, "estado" | "enMora">): string {
  return c.enMora ? "en_mora" : c.estado;
}

/**
 * La fila de la tabla: el cliente más cuánto pesa dentro del total a cobrar.
 *
 * La concentración no viene del servidor porque es relativa al total de los
 * filtros activos, que lo trae el resumen: se arma acá, donde conviven los dos.
 */
interface FilaConPeso extends FilaCliente {
  /** % del total a cobrar. null si no debe nada o no hay total que repartir. */
  concentracion: string | null;
  concentracionAlerta: boolean;
}

const TONO_ESTADO = {
  activo: "exito",
  inactivo: "neutro",
  en_mora: "peligro",
} as const;

/**
 * Columnas del archivo exportado. No son exactamente las de la tabla: el
 * teléfono no se muestra en pantalla y en una planilla es justo uno de los
 * datos que uno va a buscar.
 *
 * El CUIT va como `codigo` y no como número: Excel abriría `20123456789` como
 * `2,01235E+10`.
 */
const COLUMNAS_EXPORT: ColumnaExport<FilaCliente>[] = [
  { encabezado: "Razón social", valor: (c) => c.razonSocial, tipo: "texto", ancho: 32 },
  { encabezado: "CUIT", valor: (c) => c.cuit, tipo: "codigo", ancho: 14 },
  {
    encabezado: "Condición IVA",
    valor: (c) => etiquetaCondicionIva(c.condicionIva),
    tipo: "texto",
  },
  { encabezado: "Email", valor: (c) => c.email, tipo: "texto", ancho: 28 },
  { encabezado: "Límite de crédito", valor: (c) => c.limiteCredito, tipo: "dinero" },
  { encabezado: "Saldo", valor: (c) => c.saldo, tipo: "dinero" },
  { encabezado: "Próx. vencimiento", valor: (c) => c.proximoVencimiento, tipo: "fecha" },
  {
    encabezado: "Estado",
    valor: (c) => etiquetaEstado(estadoVisible(c)),
    tipo: "texto",
    ancho: 12,
  },
];
// El % de concentración no va al archivo a propósito: es relativo al total de
// los filtros con los que se exportó, y dentro de una planilla que alguien abre
// un mes después ese denominador ya no se ve por ningún lado. Con la columna
// Saldo, quien lo necesite lo calcula.

const features = tableFeatures({ columnVisibilityFeature });
const helper = createColumnHelper<typeof features, FilaConPeso>();

const columnas = helper.columns([
  helper.accessor("razonSocial", {
    // Sin ella la tabla no dice de qué fila está hablando.
    enableHiding: false,
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
    meta: { secundaria: true },
    header: "CUIT",
    cell: (info) => (
      <span className="tabular text-muted-foreground">{formatearCuit(info.getValue())}</span>
    ),
  }),
  helper.accessor("email", {
    meta: { secundaria: true, ancha: true },
    header: "Email",
    cell: (info) => (
      <span className="text-muted-foreground" title={info.getValue() ?? undefined}>
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  helper.accessor("condicionIva", {
    meta: { secundaria: true },
    header: "Condición IVA",
    cell: (info) => (
      <span className="text-muted-foreground">{etiquetaCondicionIva(info.getValue())}</span>
    ),
  }),
  helper.accessor("limiteCredito", {
    header: "Límite de crédito",
    meta: { alineado: "derecha", secundaria: true },
    cell: (info) =>
      info.row.original.excedeLimite ? (
        <span
          className="block text-right font-medium tabular text-danger"
          title="El saldo supera el límite de crédito"
        >
          {formatearImporte(info.getValue())} · superado
        </span>
      ) : (
        <span className="block text-right tabular text-muted-foreground">
          {formatearImporte(info.getValue())}
        </span>
      ),
  }),
  helper.accessor("saldo", {
    header: "Saldo",
    meta: { alineado: "derecha" },
    cell: (info) => {
      const valor = info.getValue();
      const debe = valor !== "0.00" && !valor.startsWith("-");
      return (
        <span
          className={cn(
            "block text-right tabular",
            debe ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {formatearImporte(valor)}
        </span>
      );
    },
  }),
  helper.accessor("proximoVencimiento", {
    meta: { secundaria: true },
    header: "Próx. vencimiento",
    cell: (info) => <CeldaVencimiento fecha={info.getValue()} />,
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
  helper.accessor("estado", {
    header: "Estado",
    cell: (info) => {
      const valor = estadoVisible(info.row.original);
      return (
        <Insignia tono={TONO_ESTADO[valor as keyof typeof TONO_ESTADO] ?? "neutro"}>
          {etiquetaEstado(valor)}
        </Insignia>
      );
    },
  }),
]);

const SIN_DATOS: FilaCliente[] = [];

/** Columna de la tabla → campo por el que ordena el servidor. */
const CAMPOS_ORDENABLES: Record<string, string | undefined> = {
  razonSocial: "razonSocial",
  cuit: "cuit",
  condicionIva: "condicionIva",
  limiteCredito: "limiteCredito",
  estado: "estado",
};

const ETIQUETA_COLUMNA: Record<string, string> = {
  razonSocial: "Razón social",
  cuit: "CUIT",
  email: "Email",
  condicionIva: "Condición IVA",
  limiteCredito: "Límite de crédito",
  saldo: "Saldo",
  proximoVencimiento: "Próx. vencimiento",
  concentracion: "Concentración",
  estado: "Estado",
};

export function ListaClientes() {
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
  // Difiere el filtrado para no disparar una request por tecla.
  const busquedaDiferida = useDeferredValue(busqueda);
  const [densidad, setDensidad] = useDensidad("clientes");
  const [escondidas, setEscondidas] = useColumnasEscondidas("clientes");

  /** Los mismos filtros alimentan el listado y el resumen: si divergen, el
   * porcentaje de cada fila se calcularía contra un total que no es el suyo. */
  const filtros = {
    busqueda: busquedaDiferida || undefined,
    ...(condicionIva ? { condicionIva: condicionIva as "exento" } : {}),
  };

  const { data, isPending, isError, refetch } = useQuery(
    trpc.clientes.listar.queryOptions({
      ...filtros,
      orden: orden as "razonSocial",
      direccion,
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  const { data: resumen, isError: resumenFallo } = useQuery(
    trpc.clientes.resumen.queryOptions(filtros),
  );

  const filas = useMemo<FilaConPeso[]>(() => {
    const items = (data?.items as FilaCliente[] | undefined) ?? SIN_DATOS;
    const total = resumen ? Money.desdeString(resumen.totalACobrar, "ARS") : null;
    const umbral = resumen ? Number(resumen.umbralConcentracion) : null;

    return items.map((cliente) => {
      const saldo = Money.desdeString(cliente.saldo, "ARS");
      // Un cliente con saldo a favor no concentra nada: no tiene sentido
      // decir que pesa -3% del total por cobrar.
      const concentracion = total && saldo.esPositivo() ? participacion(saldo, total) : null;
      return {
        ...cliente,
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
    state: { columnVisibility: aVisibilidad(escondidas) },
  });

  /**
   * Las columnas que ofrece el selector. La etiqueta sale del `header` de la
   * propia columna, no de un mapa aparte: así no puede quedar desincronizada de
   * lo que la tabla muestra. `ETIQUETA_COLUMNA` existe para el menú de orden y
   * no cubre todas las columnas.
   */
  const columnasElegibles = table.getAllColumns().map((columna) => ({
    id: columna.id,
    etiqueta:
      typeof columna.columnDef.header === "string"
        ? columna.columnDef.header
        : (ETIQUETA_COLUMNA[columna.id] ?? columna.id),
    visible: columna.getIsVisible(),
    sePuedeEsconder: columna.getCanHide(),
  }));

  const alternarColumna = (id: string) =>
    setEscondidas(
      escondidas.includes(id) ? escondidas.filter((otra) => otra !== id) : [...escondidas, id],
    );

  /**
   * Trae todo lo que matchea los filtros activos, no la página que se ve. Los
   * mismos filtros que la consulta de arriba: un archivo que no coincide con
   * la pantalla es peor que no tener exportación.
   */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.clientes.exportar.queryOptions({
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
    return { items: datos.items as FilaCliente[], truncado: datos.truncado };
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Padrón de clientes, condición fiscal y límite de crédito."
        acciones={
          soloLectura ? null : (
            <Link to="/clientes/nuevo" className={clasesBoton("primario", "sm")}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo cliente
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
              total: resumen.totalACobrar,
              contrapartes: resumen.deudores,
              concentracion: resumen.concentracion,
              umbralConcentracion: resumen.umbralConcentracion,
              semaforo: resumen.semaforo,
              hayMonedaExtranjera: resumen.hayMonedaExtranjera,
            } satisfies ResumenCartera
          }
          textos={{
            total: "Total a cobrar",
            detalle: (n) => `${n} ${n === 1 ? "cliente adeuda" : "clientes adeudan"} este total`,
            vacio: "Ningún cliente con saldo pendiente",
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
            aria-label="Buscar clientes"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!isPending && data && (
            <p className="text-xs text-muted-foreground tabular">
              {data.total} {data.total === 1 ? "cliente" : "clientes"}
            </p>
          )}
          <SelectorColumnas
            columnas={columnasElegibles}
            onAlternar={alternarColumna}
            onMostrarTodas={() => setEscondidas([])}
          />
          <SelectorDensidad valor={densidad} onCambio={setDensidad} />
        </div>
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
              ) : soloLectura ? null : (
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
                    {row.getVisibleCells().map((cell) => (
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
            nombre="clientes"
          />
        </div>
      )}
    </>
  );
}
