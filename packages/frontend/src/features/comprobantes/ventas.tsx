import {
  Boton,
  clasesBoton,
  cn,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Tarjeta,
} from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { BotonExportar } from "../../components/boton-exportar.js";
import {
  ariaSort,
  type Direccion,
  EncabezadoOrdenable,
  FiltroSelector,
  RangoFechas,
} from "../../components/filtros.js";
import { useModoLectura } from "../../components/sesion.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

type Estado = "borrador" | "enviada" | "aprobada" | "rechazada";
type Evento = "emitir" | "aprobar" | "rechazar" | "corregir";

const TONO_ESTADO = {
  borrador: "neutro",
  enviada: "info",
  aprobada: "exito",
  rechazada: "peligro",
} as const;

const ETIQUETA_ESTADO = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
} as const;

// La UI no conoce la máquina de estados: solo traduce los eventos que el
// backend declara como disponibles.
const ETIQUETA_EVENTO: Record<Evento, string> = {
  emitir: "Emitir",
  aprobar: "Aprobar",
  rechazar: "Rechazar",
  corregir: "Volver a borrador",
};

const ESTADOS: Estado[] = ["borrador", "enviada", "aprobada", "rechazada"];

interface FilaExportVenta {
  fechaEmision: string;
  letra: string;
  puntoVenta: number;
  numero: number | null;
  clienteRazonSocial: string;
  estado: string;
  moneda: string;
  neto: string;
  iva: string;
  total: string;
}

const COLUMNAS_EXPORT: ColumnaExport<FilaExportVenta>[] = [
  { encabezado: "Fecha", valor: (v) => v.fechaEmision, tipo: "fecha", ancho: 12 },
  { encabezado: "Letra", valor: (v) => v.letra, tipo: "texto", ancho: 8 },
  // Punto de venta y número son identificadores fiscales: van como texto para
  // que Excel no les coma los ceros de adelante.
  { encabezado: "Punto de venta", valor: (v) => v.puntoVenta, tipo: "codigo", ancho: 14 },
  { encabezado: "Número", valor: (v) => v.numero, tipo: "codigo", ancho: 12 },
  { encabezado: "Cliente", valor: (v) => v.clienteRazonSocial, tipo: "texto", ancho: 32 },
  { encabezado: "Estado", valor: (v) => v.estado, tipo: "texto", ancho: 12 },
  { encabezado: "Moneda", valor: (v) => v.moneda, tipo: "texto", ancho: 10 },
  { encabezado: "Neto", valor: (v) => v.neto, tipo: "dinero" },
  { encabezado: "IVA", valor: (v) => v.iva, tipo: "dinero" },
  { encabezado: "Total", valor: (v) => v.total, tipo: "dinero" },
];

export function Ventas() {
  const soloLectura = useModoLectura();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<Estado | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState("fechaEmision");
  const [direccion, setDireccion] = useState<Direccion>("desc");
  const ordenar = (campo: string, dir: Direccion) => {
    setOrden(campo);
    setDireccion(dir);
  };
  const encabezado = (etiqueta: string, campo: string, alineado?: "derecha") => (
    <th
      key={campo}
      scope="col"
      aria-sort={ariaSort(campo, orden, direccion)}
      className={cn(
        "px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase",
        alineado === "derecha" ? "text-right" : "text-left",
      )}
    >
      <EncabezadoOrdenable
        etiqueta={etiqueta}
        campo={campo}
        ordenActual={orden}
        direccion={direccion}
        onOrdenar={ordenar}
        {...(alineado ? { alineado } : {})}
      />
    </th>
  );

  const { data, isPending, isError, refetch } = useQuery(
    trpc.comprobantes.ventas.listar.queryOptions({
      estado: estado || undefined,
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
      orden: orden as "fechaEmision",
      direccion,
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  /** Todo lo que matchea los filtros activos, no la página visible. */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.comprobantes.ventas.exportar.queryOptions({
        estado: estado || undefined,
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        orden: orden as "fechaEmision",
        direccion,
      }),
      // staleTime 0 va después del spread para que gane: un archivo que el
      // usuario va a guardar no puede salir de la caché. El listado tolera 30s
      // de desfase; una exportación no.
      staleTime: 0,
    });
    return { items: datos.items as FilaExportVenta[], truncado: datos.truncado };
  }

  const transicionar = useMutation({
    ...trpc.comprobantes.ventas.transicionar.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() }),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={setDesde}
          onHasta={setHasta}
          etiquetaDesde="Emisión desde"
          etiquetaHasta="Emisión hasta"
        />
        <FiltroSelector
          etiqueta="Estado"
          valor={estado}
          textoTodos="Todos los estados"
          opciones={ESTADOS.map((e) => ({ id: e, etiqueta: ETIQUETA_ESTADO[e] }))}
          onCambio={setEstado}
        />

        {!isPending && data && (
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {data.total === 1 ? "comprobante" : "comprobantes"}
          </p>
        )}

        {!soloLectura && (
          <Link to="/comprobantes/nuevo" className={cn("ml-auto", clasesBoton("primario", "sm"))}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo comprobante
          </Link>
        )}
      </div>

      {transicionar.isError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {transicionar.error.message}
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar los comprobantes"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        ) : isPending ? (
          <div className="space-y-2 p-4" role="status" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EstadoVacio
            icono={<FileText className="size-8" aria-hidden="true" />}
            titulo={estado ? "Sin comprobantes en ese estado" : "Todavía no hay comprobantes"}
            descripcion="Emitís en borrador y el sistema calcula neto, IVA y total por alícuota."
            accion={
              soloLectura ? null : (
                <Link to="/comprobantes/nuevo" className={clasesBoton("primario", "sm")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo comprobante
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {/* El orden de los encabezados sigue al del cuerpo: cambiarlo
                      acá desalinearía la tabla entera. */}
                  {encabezado("Comprobante", "numero")}
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    Cliente
                  </th>
                  {encabezado("Fecha", "fechaEmision")}
                  {["Neto", "IVA"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {encabezado("Total", "total", "derecha")}
                  {encabezado("Estado", "estado")}
                  <th scope="col" className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/comprobantes/$comprobanteId"
                        params={{ comprobanteId: v.id }}
                        className="font-medium tabular text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {v.letra} {String(v.puntoVenta).padStart(4, "0")}-
                        {v.numero === null ? "—" : String(v.numero).padStart(8, "0")}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{v.clienteRazonSocial}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">
                      {formatearFecha(v.fechaEmision)}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">
                      {formatearImporte(v.neto, v.moneda)}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">
                      {formatearImporte(v.iva, v.moneda)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular text-foreground">
                      {formatearImporte(v.total, v.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <Insignia tono={TONO_ESTADO[v.estado as Estado]}>
                        {ETIQUETA_ESTADO[v.estado as Estado]}
                      </Insignia>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {(v.availableEvents as Evento[]).map((evento) => (
                          <Boton
                            key={evento}
                            variante={evento === "rechazar" ? "peligro" : "secundario"}
                            tamano="sm"
                            cargando={transicionar.isPending && transicionar.variables?.id === v.id}
                            onClick={() => transicionar.mutate({ id: v.id, evento })}
                          >
                            {ETIQUETA_EVENTO[evento]}
                          </Boton>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {!isPending && !isError && (data?.items.length ?? 0) > 0 && (
        <div className="mt-3 flex justify-end">
          <BotonExportar
            traerFilas={traerParaExportar}
            columnas={COLUMNAS_EXPORT}
            nombre="comprobantes-venta"
          />
        </div>
      )}
    </>
  );
}
