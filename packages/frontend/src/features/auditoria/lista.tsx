import {
  Boton,
  Campo,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Fragment, useState } from "react";
import { BotonExportar } from "../../components/boton-exportar.js";
import { EncabezadoPagina } from "../../components/layout.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import { useTRPC } from "../../lib/trpc.js";

type Tono = "exito" | "advertencia" | "peligro" | "info" | "neutro";

/** Cómo se lee cada acción y con qué peso. */
const ACCION: Record<string, { etiqueta: string; tono: Tono }> = {
  alta: { etiqueta: "Alta", tono: "exito" },
  modificacion: { etiqueta: "Modificación", tono: "info" },
  baja: { etiqueta: "Baja", tono: "peligro" },
  transicion_estado: { etiqueta: "Cambio de estado", tono: "advertencia" },
};

const TAMANO_PAGINA = 25;

function fechaHora(valor: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(valor));
}

/** El snapshot crudo. Es para leer, no para editar: va tal cual se guardó. */
function Detalle({ detalle }: { detalle: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
      {JSON.stringify(detalle, null, 2)}
    </pre>
  );
}

interface FilaExportAuditoria {
  fecha: string | Date;
  autor: string | null;
  autorEmail: string | null;
  modulo: string;
  tabla: string;
  accion: string;
  detalle: unknown;
}

const COLUMNAS_EXPORT: ColumnaExport<FilaExportAuditoria>[] = [
  // Esta sí es un instante con hora, no una fecha suelta: se exporta en hora
  // argentina.
  {
    encabezado: "Fecha",
    valor: (e) => (e.fecha instanceof Date ? e.fecha.toISOString() : e.fecha),
    tipo: "fecha",
    ancho: 14,
  },
  { encabezado: "Autor", valor: (e) => e.autor, tipo: "texto", ancho: 26 },
  { encabezado: "Email", valor: (e) => e.autorEmail, tipo: "texto", ancho: 28 },
  { encabezado: "Módulo", valor: (e) => e.modulo || e.tabla, tipo: "texto", ancho: 18 },
  {
    encabezado: "Acción",
    valor: (e) => ACCION[e.accion]?.etiqueta ?? e.accion,
    tipo: "texto",
    ancho: 16,
  },
  // El detalle es el antes y el después de cada cambio: es justo lo que se va
  // a buscar en un historial exportado, así que va aunque quede largo.
  {
    encabezado: "Detalle",
    valor: (e) => (e.detalle == null ? null : JSON.stringify(e.detalle)),
    tipo: "texto",
    ancho: 60,
  },
];

export function Auditoria() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [modulo, setModulo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<string | null>(null);

  const { data: modulos } = useQuery(trpc.auditoria.modulos.queryOptions());
  const { data, isPending, isError, refetch } = useQuery(
    trpc.auditoria.listar.queryOptions({
      pagina,
      tamanoPagina: TAMANO_PAGINA,
      ...(modulo ? { modulo: modulo as "clientes" } : {}),
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
    }),
  );

  /**
   * Todo lo que matchea los filtros, no la página que se está viendo. Acá se
   * nota más que en el resto: el historial se pagina de a poco y exportar la
   * página visible no serviría para nada.
   */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.auditoria.exportar.queryOptions({
        ...(modulo ? { modulo: modulo as "clientes" } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
      }),
      // staleTime 0 va después del spread para que gane: un archivo que el
      // usuario va a guardar no puede salir de la caché. El listado tolera 30s
      // de desfase; una exportación no.
      staleTime: 0,
    });
    return { items: datos.items as FilaExportAuditoria[], truncado: datos.truncado };
  }

  // Cualquier cambio de filtro invalida la página en la que estabas.
  const cambiarFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };

  const paginas = data ? Math.max(1, Math.ceil(data.total / TAMANO_PAGINA)) : 1;

  return (
    <>
      <EncabezadoPagina
        titulo="Historial"
        descripcion="Quién cambió qué y cuándo. No se puede editar ni borrar."
      />

      <Tarjeta className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Módulo">
            {({ id }) => (
              <Selector
                id={id}
                value={modulo}
                onChange={(e) => cambiarFiltro(() => setModulo(e.target.value))}
              >
                <option value="">Todos</option>
                {modulos?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.etiqueta}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>

          <Campo etiqueta="Desde">
            {({ id }) => (
              <Entrada
                id={id}
                type="date"
                value={desde}
                onChange={(e) => cambiarFiltro(() => setDesde(e.target.value))}
              />
            )}
          </Campo>

          <Campo etiqueta="Hasta">
            {({ id }) => (
              <Entrada
                id={id}
                type="date"
                value={hasta}
                onChange={(e) => cambiarFiltro(() => setHasta(e.target.value))}
              />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {isError ? (
        <Tarjeta>
          <EstadoVacio
            titulo="No se pudo cargar el historial"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        </Tarjeta>
      ) : isPending ? (
        <div className="space-y-2" role="status" aria-busy="true" aria-label="Cargando historial">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={<ScrollText className="size-8" aria-hidden="true" />}
            titulo="No hay movimientos con esos filtros"
            descripcion="Probá ampliar el rango de fechas o sacar el filtro de módulo."
          />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Historial de operaciones</caption>
                <thead>
                  <tr className="border-b border-border">
                    {["Cuándo", "Quién", "Módulo", "Acción", ""].map((h, i) => (
                      <th
                        // biome-ignore lint/suspicious/noArrayIndexKey: encabezados fijos
                        key={i}
                        scope="col"
                        className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entrada) => {
                    const abierto = abierta === entrada.id;
                    const accion = ACCION[entrada.accion] ?? {
                      etiqueta: entrada.accion,
                      tono: "neutro" as const,
                    };
                    const etiquetaModulo =
                      modulos?.find((m) => m.id === entrada.modulo)?.etiqueta ?? entrada.tabla;

                    return (
                      <Fragment key={entrada.id}>
                        <tr className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3 tabular whitespace-nowrap text-muted-foreground">
                            {fechaHora(entrada.fecha)}
                          </td>
                          <td className="px-4 py-3">
                            {entrada.autor ? (
                              <>
                                <p className="font-medium text-foreground">{entrada.autor}</p>
                                <p className="text-xs text-muted-foreground">
                                  {entrada.autorEmail}
                                </p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Proceso automático</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{etiquetaModulo}</td>
                          <td className="px-4 py-3">
                            <Insignia tono={accion.tono}>{accion.etiqueta}</Insignia>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Boton
                              variante="fantasma"
                              tamano="sm"
                              aria-expanded={abierto}
                              onClick={() => setAbierta(abierto ? null : entrada.id)}
                            >
                              {abierto ? (
                                <ChevronDown className="size-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="size-4" aria-hidden="true" />
                              )}
                              Detalle
                            </Boton>
                          </td>
                        </tr>
                        {abierto && (
                          <tr className="border-b border-border/60">
                            <td colSpan={5} className="px-4 pb-3">
                              <Detalle detalle={entrada.detalle} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular">
              {data.total} {data.total === 1 ? "movimiento" : "movimientos"} · página {pagina} de{" "}
              {paginas}
            </p>
            <div className="flex items-center gap-2">
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
              <BotonExportar
                traerFilas={traerParaExportar}
                columnas={COLUMNAS_EXPORT}
                nombre="historial"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Para quien entra por URL sin ser Administrador. */
export function AuditoriaSinPermiso() {
  return (
    <>
      <EncabezadoPagina titulo="Historial" />
      <Tarjeta>
        <EstadoVacio
          icono={<ScrollText className="size-8" aria-hidden="true" />}
          titulo="Esta sección es del Administrador"
          descripcion="El historial de la empresa lo consulta quien la administra."
        />
      </Tarjeta>
    </>
  );
}
