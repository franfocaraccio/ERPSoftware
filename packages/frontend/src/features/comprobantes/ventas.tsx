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
import {
  ariaSort,
  type Direccion,
  EncabezadoOrdenable,
  RangoFechas,
} from "../../components/filtros.js";
import { useModoLectura } from "../../components/sesion.js";
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

  const transicionar = useMutation({
    ...trpc.comprobantes.ventas.transicionar.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() }),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as Estado | "")}
          aria-label="Filtrar por estado"
          className="h-10 cursor-pointer rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-ring"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>

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
    </>
  );
}
