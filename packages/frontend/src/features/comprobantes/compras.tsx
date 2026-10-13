import { hoyEnArgentina } from "@erp/core/dates";
import {
  Boton,
  Campo,
  cn,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck, FileUp, Plus, ShoppingCart, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { BotonExportar } from "../../components/boton-exportar.js";
import { BotonLeerComprobante } from "../../components/boton-leer-comprobante.js";
import { RangoFechas } from "../../components/filtros.js";
import { SelectorDensidad } from "../../components/selector-densidad.js";
import { useModoLectura } from "../../components/sesion.js";
import { clasesCelda, clasesEncabezado, useDensidad } from "../../lib/densidad.js";
import type { ColumnaExport } from "../../lib/exportar.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { opcional, primerError } from "../../lib/formulario.js";
import { type LecturaCompra, textoReparo } from "../../lib/lectura.js";
import { useTRPC } from "../../lib/trpc.js";
import { CeldaCobranza } from "./cobranza.js";

const importe = (mensaje: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), mensaje);

const compraSchema = z.object({
  proveedorId: z.string().min(1, "Elegí un proveedor"),
  letra: z.string(),
  numeroCompleto: z.string().trim(),
  // La pone el proveedor y puede faltar; la de recepción es la obligatoria,
  // porque de ella cuelga el plazo de pago y la proyección de egresos.
  fechaEmision: z.string().trim(),
  fechaRecepcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  condicionPagoDias: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) <= 365, "Días entre 0 y 365"),
  concepto: z.string().trim(),
  categoriaId: z.string(),
  // Lo que trajo la compra de mercadería: suma stock y pondera el costo. Las
  // filas vacías se ignoran al guardar.
  items: z.array(
    z.object({ productoId: z.string(), cantidad: z.string(), costoUnitario: z.string() }),
  ),
  neto: importe("Usá punto decimal, máximo 2 decimales"),
  iva: importe("Usá punto decimal, máximo 2 decimales"),
  total: importe("Usá punto decimal, máximo 2 decimales"),
});

type ValoresCompra = z.infer<typeof compraSchema>;

/**
 * Los valores con los que arranca el formulario.
 *
 * Lo que la lectura no pudo entender queda **vacío**, nunca relleno con un
 * valor por defecto: un campo precargado se lee como un dato que alguien
 * confirmó, y acá nadie lo confirmó todavía.
 */
function valoresIniciales(lectura?: LecturaCompra | null): ValoresCompra {
  const p = lectura?.propuesta;
  return {
    proveedorId: lectura?.contraparteId ?? "",
    letra: p?.letra ?? "A",
    numeroCompleto: p?.numeroCompleto ?? "",
    fechaEmision: p?.fechaEmision ?? "",
    // La recepción no está en el papel: es cuándo nos llegó, y hoy es la mejor
    // suposición.
    fechaRecepcion: hoyEnArgentina(),
    condicionPagoDias: "30",
    concepto: p?.concepto ?? "",
    // Lo leído de una factura no dice si es mercadería o un gasto, ni qué
    // productos trajo: eso lo completa la persona.
    categoriaId: "",
    items: [],
    neto: p?.neto ?? "",
    iva: p?.iva ?? "",
    total: p?.total ?? "",
  };
}

/** El reparo de ese campo, listo para mostrar debajo del input. */
function ayudaDe(lectura: LecturaCompra | null | undefined, campo: string): string | undefined {
  const reparo = lectura?.propuesta.reparos.find((r) => r.campo === campo);
  return reparo ? textoReparo(reparo) : undefined;
}

/**
 * Lo que hay que mirar antes de guardar.
 *
 * Va arriba y además en cada campo: el resumen dice cuántos son, para que no
 * haya que recorrer el formulario buscándolos, y el campo dice qué pasa con
 * ese dato en particular.
 */
function AvisoReparos({ lectura }: { lectura: LecturaCompra }) {
  const { reparos } = lectura.propuesta;
  return (
    <div className="mb-4 flex gap-2.5 rounded-lg border border-border bg-surface-muted p-3">
      {reparos.length > 0 ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <FileCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      )}
      <div className="text-sm">
        <p className="font-medium text-foreground">
          Leído de <span className="font-normal">{lectura.archivo.nombre}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {reparos.length === 0
            ? "Todo se entendió y los totales cierran. Revisalo igual antes de guardar: nada se carga solo."
            : `Hay ${reparos.length} ${reparos.length === 1 ? "dato" : "datos"} para revisar, marcados abajo.`}
        </p>
        {lectura.contraparteId === null && lectura.propuesta.emisorRazonSocial !== "" && (
          <p className="mt-1 text-muted-foreground">
            El emisor es{" "}
            <strong className="font-medium">{lectura.propuesta.emisorRazonSocial}</strong>
            {lectura.propuesta.emisorCuit !== null && ` (CUIT ${lectura.propuesta.emisorCuit})`},
            que no está cargado como proveedor. Elegilo de la lista o crealo primero.
          </p>
        )}
      </div>
    </div>
  );
}

function FormularioCompra({
  onListo,
  lectura,
}: {
  onListo: () => void;
  lectura?: LecturaCompra | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const crear = useMutation(trpc.comprobantes.compras.crear.mutationOptions());
  const proveedores = useQuery(
    trpc.proveedores.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }),
  );
  const categorias = useQuery(trpc.resultados.categorias.listar.queryOptions());
  const productos = useQuery(
    trpc.stock.listar.queryOptions({ soloReponer: false, pagina: 1, tamanoPagina: 100 }),
  );

  const form = useForm({
    defaultValues: valoresIniciales(lectura),
    validators: { onBlur: compraSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        proveedorId: value.proveedorId,
        letra: (value.letra || null) as "A" | "B" | "C" | "E" | null,
        numeroCompleto: opcional(value.numeroCompleto),
        ...(value.fechaEmision ? { fechaEmision: value.fechaEmision } : {}),
        fechaRecepcion: value.fechaRecepcion,
        condicionPagoDias: Number(value.condicionPagoDias),
        concepto: opcional(value.concepto),
        categoriaId: value.categoriaId || null,
        // Sólo la mercadería trae productos; un servicio no mueve stock.
        items: value.categoriaId
          ? []
          : value.items
              .filter((i) => i.productoId && i.cantidad.trim() && i.costoUnitario.trim())
              .map((i) => ({
                productoId: i.productoId,
                descripcion:
                  productos.data?.items.find((p) => p.id === i.productoId)?.descripcion ?? "",
                cantidad: i.cantidad.trim(),
                costoUnitario: i.costoUnitario.trim(),
              })),
        moneda: "ARS",
        neto: value.neto.trim(),
        iva: value.iva.trim(),
        total: value.total.trim(),
        // Queda en el audit log: el archivo no se guarda, pero sí de cuál salió.
        ...(lectura ? { origenArchivo: lectura.archivo } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() });
      // El saldo a pagar del proveedor depende de esta compra, y el stock y el
      // costo de los productos que trajo.
      await queryClient.invalidateQueries({ queryKey: trpc.proveedores.pathKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
      onListo();
    },
  });

  return (
    <Tarjeta className="mb-4 p-5">
      {lectura && <AvisoReparos lectura={lectura} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="proveedorId">
            {(field) => (
              <Campo
                etiqueta="Proveedor"
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
                    <option value="">Elegí un proveedor</option>
                    {proveedores.data?.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.razonSocial}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="letra">
            {(field) => (
              <Campo etiqueta="Letra">
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    {["A", "B", "C", "E"].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="numeroCompleto">
            {(field) => (
              <Campo
                etiqueta="Número"
                ayuda={ayudaDe(lectura, "numeroCompleto") ?? "Como figura en el comprobante"}
              >
                {({ id }) => (
                  <Entrada
                    id={id}
                    placeholder="0003-00004567"
                    className="tabular"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="fechaEmision">
            {(field) => (
              <Campo etiqueta="Fecha de emisión" ayuda={ayudaDe(lectura, "fechaEmision")}>
                {({ id }) => (
                  <Entrada
                    id={id}
                    type="date"
                    className="tabular"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </Campo>
            )}
          </form.Field>

          <form.Field name="fechaRecepcion">
            {(field) => (
              <Campo
                etiqueta="Fecha de recepción"
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

          <form.Field name="condicionPagoDias">
            {(field) => (
              <Campo
                etiqueta="Condición de pago (días)"
                requerido
                ayuda="Define el vencimiento"
                error={
                  field.state.meta.isBlurred ? primerError(field.state.meta.errors) : undefined
                }
              >
                {({ id, invalido }) => (
                  <Entrada
                    id={id}
                    inputMode="numeric"
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

          <form.Field name="categoriaId">
            {(field) => (
              <Campo
                etiqueta="Qué es"
                ayuda="La mercadería va al stock; un servicio es un gasto del mes"
              >
                {({ id }) => (
                  <Selector
                    id={id}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="">Mercadería para stock</option>
                    <optgroup label="Gasto">
                      {categorias.data
                        ?.filter((c) => c.tipo === "gasto" && c.activa)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </optgroup>
                  </Selector>
                )}
              </Campo>
            )}
          </form.Field>

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

          {/* En compras los importes se transcriben del comprobante recibido:
              no se recalculan, porque el documento lo emitió el proveedor. */}
          {(["neto", "iva", "total"] as const).map((campo) => (
            <form.Field key={campo} name={campo}>
              {(field) => (
                <Campo
                  etiqueta={campo === "iva" ? "IVA" : campo === "neto" ? "Neto" : "Total"}
                  requerido={campo === "total"}
                  ayuda={ayudaDe(lectura, campo)}
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
          ))}
        </div>

        <form.Subscribe selector={(st) => st.values.categoriaId}>
          {(categoriaId) =>
            categoriaId ? null : (
              <form.Field name="items" mode="array">
                {(campoItems) => (
                  <fieldset className="space-y-2 rounded-lg border border-border p-3">
                    <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Productos (opcional)
                    </legend>
                    <p className="text-xs text-muted-foreground">
                      Si cargás qué trajo, suma al stock y actualiza el costo de cada producto
                      (promedio ponderado). El costo va sin IVA. Después no se edita: se corrige con
                      un ajuste de stock.
                    </p>
                    {campoItems.state.value.map((_, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: el índice es la fila
                        key={i}
                        className="grid gap-2 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end"
                      >
                        <form.Field name={`items[${i}].productoId`}>
                          {(f) => (
                            <Campo etiqueta="Producto">
                              {({ id }) => (
                                <Selector
                                  id={id}
                                  value={f.state.value}
                                  onChange={(e) => f.handleChange(e.target.value)}
                                >
                                  <option value="">Elegí un producto</option>
                                  {productos.data?.items.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.sku} — {p.descripcion}
                                    </option>
                                  ))}
                                </Selector>
                              )}
                            </Campo>
                          )}
                        </form.Field>
                        <form.Field name={`items[${i}].cantidad`}>
                          {(f) => (
                            <Campo etiqueta="Cantidad">
                              {({ id }) => (
                                <Entrada
                                  id={id}
                                  inputMode="decimal"
                                  className="tabular"
                                  value={f.state.value}
                                  onChange={(e) => f.handleChange(e.target.value)}
                                />
                              )}
                            </Campo>
                          )}
                        </form.Field>
                        <form.Field name={`items[${i}].costoUnitario`}>
                          {(f) => (
                            <Campo etiqueta="Costo unit. (neto)">
                              {({ id }) => (
                                <Entrada
                                  id={id}
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  className="tabular"
                                  value={f.state.value}
                                  onChange={(e) => f.handleChange(e.target.value)}
                                />
                              )}
                            </Campo>
                          )}
                        </form.Field>
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => campoItems.removeValue(i)}
                        >
                          Quitar
                        </Boton>
                      </div>
                    ))}
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() =>
                        campoItems.pushValue({ productoId: "", cantidad: "", costoUnitario: "" })
                      }
                    >
                      Agregar producto
                    </Boton>
                  </fieldset>
                )}
              </form.Field>
            )
          }
        </form.Subscribe>

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
                Registrar compra
              </Boton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Tarjeta>
  );
}

interface FilaExportCompra {
  fechaRecepcion: string;
  letra: string;
  numeroCompleto: string;
  proveedorRazonSocial: string;
  condicionPagoDias: number;
  moneda: string;
  neto: string;
  iva: string;
  total: string;
}

const COLUMNAS_EXPORT: ColumnaExport<FilaExportCompra>[] = [
  { encabezado: "Fecha de recepción", valor: (c) => c.fechaRecepcion, tipo: "fecha", ancho: 16 },
  { encabezado: "Letra", valor: (c) => c.letra, tipo: "texto", ancho: 8 },
  { encabezado: "Número", valor: (c) => c.numeroCompleto, tipo: "codigo", ancho: 18 },
  { encabezado: "Proveedor", valor: (c) => c.proveedorRazonSocial, tipo: "texto", ancho: 32 },
  { encabezado: "Plazo de pago (días)", valor: (c) => c.condicionPagoDias, tipo: "numero" },
  { encabezado: "Moneda", valor: (c) => c.moneda, tipo: "texto", ancho: 10 },
  { encabezado: "Neto", valor: (c) => c.neto, tipo: "dinero" },
  { encabezado: "IVA", valor: (c) => c.iva, tipo: "dinero" },
  { encabezado: "Total", valor: (c) => c.total, tipo: "dinero" },
];

export function Compras() {
  const soloLectura = useModoLectura();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [lectura, setLectura] = useState<LecturaCompra | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [densidad, setDensidad] = useDensidad("comprobantes-compra");
  const { data, isPending, isError, refetch } = useQuery(
    trpc.comprobantes.compras.listar.queryOptions({
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
      pagina: 1,
      tamanoPagina: 50,
    }),
  );

  /** Todo lo que matchea los filtros activos, no la página visible. */
  async function traerParaExportar() {
    const datos = await queryClient.fetchQuery({
      ...trpc.comprobantes.compras.exportar.queryOptions({
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
      }),
      // staleTime 0 va después del spread para que gane: un archivo que el
      // usuario va a guardar no puede salir de la caché. El listado tolera 30s
      // de desfase; una exportación no.
      staleTime: 0,
    });
    return { items: datos.items as FilaExportCompra[], truncado: datos.truncado };
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {/* Sobre la fecha de recepción, que es de la que cuelga el plazo de
            pago y, por lo tanto, la proyección de egresos. */}
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={setDesde}
          onHasta={setHasta}
          etiquetaDesde="Recepción desde"
          etiquetaHasta="Recepción hasta"
        />
        {!isPending && data && (
          <p className="text-xs text-muted-foreground tabular">
            {data.total} {data.total === 1 ? "compra" : "compras"}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!creando && !soloLectura && (
            <>
              <BotonLeerComprobante<LecturaCompra>
                tipo="compra"
                onLeido={(l) => {
                  setLectura(l);
                  setCreando(true);
                }}
              />
              <Boton
                tamano="sm"
                onClick={() => {
                  setLectura(null);
                  setCreando(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Nueva compra
              </Boton>
            </>
          )}
          <SelectorDensidad valor={densidad} onCambio={setDensidad} />
        </div>
      </div>

      {creando && (
        <FormularioCompra
          // Remonta el formulario al llegar una lectura nueva: TanStack Form
          // toma los defaultValues una sola vez.
          key={lectura?.archivo.hash ?? "manual"}
          lectura={lectura}
          onListo={() => {
            setCreando(false);
            setLectura(null);
          }}
        />
      )}

      <Tarjeta className="overflow-hidden">
        {isError ? (
          <EstadoVacio
            titulo="No se pudieron cargar las compras"
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
            icono={<ShoppingCart className="size-8" aria-hidden="true" />}
            titulo="Todavía no hay compras"
            descripcion="Las compras alimentan el saldo a pagar y la proyección de egresos."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Comprobante", "Proveedor", "Recepción", "Plazo"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        clasesEncabezado(densidad),
                        "text-left text-xs font-medium tracking-wide text-muted-foreground uppercase",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                  {["Neto", "IVA", "Total"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        clasesEncabezado(densidad),
                        "text-right text-xs font-medium tracking-wide text-muted-foreground uppercase",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className={cn(
                      clasesEncabezado(densidad),
                      "text-left text-xs font-medium tracking-wide text-muted-foreground uppercase",
                    )}
                  >
                    Pago
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td
                      className={cn(clasesCelda(densidad), "tabular font-medium text-foreground")}
                    >
                      {c.letra ?? "—"} {c.numeroCompleto ?? ""}
                    </td>
                    <td className={cn(clasesCelda(densidad), "text-muted-foreground")}>
                      {c.proveedorRazonSocial}
                    </td>
                    <td className={cn(clasesCelda(densidad), "tabular text-muted-foreground")}>
                      {formatearFecha(c.fechaRecepcion)}
                    </td>
                    <td className={cn(clasesCelda(densidad), "tabular text-muted-foreground")}>
                      {c.condicionPagoDias} d
                    </td>
                    <td
                      className={cn(
                        clasesCelda(densidad),
                        "text-right tabular text-muted-foreground",
                      )}
                    >
                      {formatearImporte(c.neto, c.moneda)}
                    </td>
                    <td
                      className={cn(
                        clasesCelda(densidad),
                        "text-right tabular text-muted-foreground",
                      )}
                    >
                      {formatearImporte(c.iva, c.moneda)}
                    </td>
                    <td
                      className={cn(
                        clasesCelda(densidad),
                        "text-right font-medium tabular text-foreground",
                      )}
                    >
                      {formatearImporte(c.total, c.moneda)}
                    </td>
                    <td className={clasesCelda(densidad)}>
                      <CeldaCobranza cobranza={c.cobranza} lado="compras" moneda={c.moneda} />
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
            nombre="comprobantes-compra"
          />
        </div>
      )}
    </>
  );
}
