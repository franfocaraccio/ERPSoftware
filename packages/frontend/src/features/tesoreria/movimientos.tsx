import { hoyEnArgentina } from "@erp/core/dates";
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
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { BotonExportar } from "../../components/boton-exportar.js";
import {
  ariaSort,
  BarraFiltros,
  type Direccion,
  EncabezadoOrdenable,
  FiltroSelector,
  RangoFechas,
} from "../../components/filtros.js";
import { useModoLectura } from "../../components/sesion.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { opcional, primerError } from "../../lib/formulario.js";
import { useTRPC } from "../../lib/trpc.js";

const ETIQUETA_MEDIO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
} as const;

const movimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  cuentaId: z.string().min(1, "Elegí una cuenta"),
  tipo: z.enum(["ingreso", "egreso"]),
  medioPago: z.enum(["efectivo", "transferencia", "cheque"]),
  concepto: z.string().trim(),
  importe: z
    .string()
    .trim()
    .refine(
      (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0,
      "Importe mayor a cero, con punto decimal",
    ),
  contraparte: z.string(),
  chequeId: z.string(),
});

type ValoresMovimiento = z.infer<typeof movimientoSchema>;

function FormularioMovimiento({ onListo }: { onListo: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.tesoreria.movimientos.crear.mutationOptions());

  const cuentas = useQuery(trpc.tesoreria.cuentas.listar.queryOptions());
  const clientes = useQuery(trpc.clientes.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }));
  const proveedores = useQuery(
    trpc.proveedores.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }),
  );
  const chequesEnCartera = useQuery(
    trpc.tesoreria.cheques.listar.queryOptions({
      estado: "en_cartera",
      pagina: 1,
      tamanoPagina: 100,
    }),
  );

  const form = useForm({
    defaultValues: {
      fecha: hoyEnArgentina(),
      cuentaId: "",
      tipo: "ingreso",
      medioPago: "transferencia",
      concepto: "",
      importe: "",
      contraparte: "",
      chequeId: "",
    } as ValoresMovimiento,
    validators: { onBlur: movimientoSchema },
    onSubmit: async ({ value }) => {
      // La contraparte se elige en un solo selector; el prefijo dice si es
      // cliente o proveedor, que el backend exige mutuamente excluyentes.
      const [clase, id] = value.contraparte.split(":");
      await crear.mutateAsync({
        fecha: value.fecha,
        cuentaId: value.cuentaId,
        tipo: value.tipo,
        medioPago: value.medioPago,
        concepto: opcional(value.concepto),
        importe: value.importe.trim(),
        clienteId: clase === "cliente" ? id : null,
        proveedorId: clase === "proveedor" ? id : null,
        chequeId: value.chequeId || null,
        conciliado: false,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.tesoreria.pathKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.proveedores.pathKey() });
      onListo();
    },
  });

  return (
    <Tarjeta className="mb-4 p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="fecha">
            {(field) => (
              <Campo
                etiqueta="Fecha"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Entrada
                    id={id}
                    type="date"
                    className="tabular"
                    invalido={invalido}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="cuentaId">
            {(field) => (
              <Campo
                etiqueta="Cuenta"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Selector
                    id={id}
                    invalido={invalido}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  >
                    <option value="">Elegí una cuenta</option>
                    {cuentas.data?.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda})
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="tipo">
            {(field) => (
              <Campo etiqueta="Tipo">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as ValoresMovimiento["tipo"])
                    }
                  >
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="importe">
            {(field) => (
              <Campo
                etiqueta="Importe"
                requerido
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Entrada
                    id={id}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="tabular"
                    invalido={invalido}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="medioPago">
            {(field) => (
              <Campo etiqueta="Medio de pago">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as ValoresMovimiento["medioPago"])
                    }
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="contraparte">
            {(field) => (
              <Campo etiqueta="Contraparte" ayuda="Para la cuenta corriente">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="">Sin contraparte</option>
                    <optgroup label="Clientes">
                      {clientes.data?.items.map((c) => (
                        <option key={c.id} value={`cliente:${c.id}`}>
                          {c.razonSocial}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Proveedores">
                      {proveedores.data?.items.map((p) => (
                        <option key={p.id} value={`proveedor:${p.id}`}>
                          {p.razonSocial}
                        </option>
                      ))}
                    </optgroup>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>
        </div>

        {/* El cheque solo se pide cuando el medio de pago lo requiere. */}
        <form.Subscribe selector={(s) => s.values.medioPago}>
          {(medio) =>
            medio === "cheque" ? (
              <form.Field name="chequeId">
                {(field) => (
                  <Campo etiqueta="Cheque" requerido ayuda="Cheques en cartera">
                    {({ id }) => (
                      <Selector
                        id={id}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      >
                        <option value="">Elegí un cheque</option>
                        {chequesEnCartera.data?.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.libradorNombreEfectivo} · {formatearImporte(c.importe)}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>

        <form.Field name="concepto">
          {(field) => (
            <Campo etiqueta="Concepto">
              {({ id }) => (
                <Entrada
                  id={id}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </Campo>
          )}
        </form.Field>

        {crear.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo registrar: {crear.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="secundario" tamano="sm" onClick={onListo}>
            Cancelar
          </Boton>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => (
              <Boton type="submit" tamano="sm" cargando={enviando}>
                Registrar movimiento
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

const TIPOS_MOVIMIENTO = [
  { id: "ingreso" as const, etiqueta: "Ingresos" },
  { id: "egreso" as const, etiqueta: "Egresos" },
];

interface FilaExportMovimiento {
  fecha: string;
  cuentaNombre: string;
  cuentaMoneda: "ARS" | "USD";
  tipo: "ingreso" | "egreso";
  medioPago: string;
  concepto: string | null;
  importe: string;
}

const COLUMNAS_EXPORT: ColumnaExport<FilaExportMovimiento>[] = [
  { encabezado: "Fecha", valor: (m) => m.fecha, tipo: "fecha", ancho: 12 },
  { encabezado: "Cuenta", valor: (m) => m.cuentaNombre, tipo: "texto", ancho: 24 },
  { encabezado: "Moneda", valor: (m) => m.cuentaMoneda, tipo: "texto", ancho: 10 },
  {
    encabezado: "Tipo",
    valor: (m) => (m.tipo === "ingreso" ? "Ingreso" : "Egreso"),
    tipo: "texto",
    ancho: 12,
  },
  { encabezado: "Medio de pago", valor: (m) => m.medioPago, tipo: "texto" },
  { encabezado: "Concepto", valor: (m) => m.concepto, tipo: "texto", ancho: 36 },
  { encabezado: "Importe", valor: (m) => m.importe, tipo: "dinero" },
];

export function Movimientos() {
  const soloLectura = useModoLectura();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [cuentaId, setCuentaId] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<string>("fecha");
  const [direccion, setDireccion] = useState<Direccion>("desc");

  const cuentas = useQuery(trpc.tesoreria.cuentas.listar.queryOptions());
  const { data, isPending, isError, refetch } = useQuery(
    trpc.tesoreria.movimientos.listar.queryOptions({
      ...(cuentaId ? { cuentaId } : {}),
      ...(tipo ? { tipo } : {}),
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
      orden: orden as "fecha",
      direccion,
      pagina: 1,
      tamanoPagina: 100,
    }),
  );

  /** Todo lo que matchea los filtros activos, no la página visible. */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.tesoreria.movimientos.exportar.queryOptions({
        ...(cuentaId ? { cuentaId } : {}),
        ...(tipo ? { tipo } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        orden: orden as "fecha",
        direccion,
      }),
      // staleTime 0 va después del spread para que gane: un archivo que el
      // usuario va a guardar no puede salir de la caché. El listado tolera 30s
      // de desfase; una exportación no.
      staleTime: 0,
    });
    return { items: datos.items as FilaExportMovimiento[], truncado: datos.truncado };
  }

  const hayFiltros = Boolean(cuentaId || tipo || desde || hasta);
  const limpiar = () => {
    setCuentaId("");
    setTipo("");
    setDesde("");
    setHasta("");
  };

  const ordenar = (campo: string, dir: Direccion) => {
    setOrden(campo);
    setDireccion(dir);
  };

  const encabezado = (etiqueta: string, campo: string, alineado?: "derecha") => (
    <th
      key={campo}
      scope="col"
      aria-sort={ariaSort(campo, orden, direccion)}
      className={`px-4 py-2.5 text-xs font-medium tracking-wide uppercase ${alineado === "derecha" ? "text-right" : "text-left"}`}
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

  return (
    <>
      <BarraFiltros
        hayFiltros={hayFiltros}
        onLimpiar={limpiar}
        resumen={
          !isPending &&
          data && (
            <p className="text-xs text-muted-foreground tabular">
              {data.total} {data.total === 1 ? "movimiento" : "movimientos"}
            </p>
          )
        }
      >
        <FiltroSelector
          etiqueta="Cuenta"
          valor={cuentaId}
          textoTodos="Todas"
          opciones={(cuentas.data?.items ?? []).map((c) => ({ id: c.id, etiqueta: c.nombre }))}
          onCambio={setCuentaId}
        />
        <FiltroSelector
          etiqueta="Tipo"
          valor={tipo}
          opciones={TIPOS_MOVIMIENTO}
          onCambio={setTipo}
        />
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={setDesde}
          onHasta={setHasta}
          etiquetaDesde="Fecha desde"
          etiquetaHasta="Fecha hasta"
        />
      </BarraFiltros>

      <div className="mb-4 flex items-center justify-between gap-3">
        {!creando && !soloLectura && (
          <Boton tamano="sm" className="ml-auto" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo movimiento
          </Boton>
        )}
      </div>

      {creando && <FormularioMovimiento onListo={() => setCreando(false)} />}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar los movimientos"
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
            icono={<ArrowUpRight className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay movimientos"
            descripcion="Registrá ingresos y egresos para ver el saldo de cada cuenta."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {encabezado("Fecha", "fecha")}
                  {encabezado("Cuenta", "cuenta")}
                  {["Concepto", "Medio"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {encabezado("Tipo", "tipo")}
                  {encabezado("Importe", "importe", "derecha")}
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => {
                  const esIngreso = m.tipo === "ingreso";
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className="px-4 py-3 tabular text-muted-foreground">
                        {formatearFecha(m.fecha)}
                      </td>
                      <td className="px-4 py-3 text-foreground">{m.cuentaNombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.concepto ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ETIQUETA_MEDIO[m.medioPago]}
                      </td>
                      <td className="px-4 py-3">
                        <Insignia tono={esIngreso ? "exito" : "neutro"}>
                          {esIngreso ? (
                            <ArrowDownLeft className="mr-1 size-3" aria-hidden="true" />
                          ) : (
                            <ArrowUpRight className="mr-1 size-3" aria-hidden="true" />
                          )}
                          {esIngreso ? "Ingreso" : "Egreso"}
                        </Insignia>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium tabular ${esIngreso ? "text-success" : "text-foreground"}`}
                      >
                        {esIngreso ? "" : "−"}
                        {formatearImporte(m.importe, m.cuentaMoneda)}
                      </td>
                    </tr>
                  );
                })}
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
            nombre="movimientos"
          />
        </div>
      )}
    </>
  );
}
