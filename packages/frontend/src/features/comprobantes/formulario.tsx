import { hoyEnArgentina } from "@erp/core/dates";
import { type AlicuotaIva, calcularComprobante } from "@erp/core/invoicing";
import { Money } from "@erp/core/money";
import { Boton, Campo, clasesBoton, Entrada, Selector, Tarjeta } from "@erp/design-system";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, FileCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { BotonLeerComprobante } from "../../components/boton-leer-comprobante.js";
import { EncabezadoPagina } from "../../components/layout.js";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearImporte } from "../../lib/formato.js";
import { primerError } from "../../lib/formulario.js";
import { type LecturaVenta, leerComprobante, textoReparo } from "../../lib/lectura.js";
import { useTRPC } from "../../lib/trpc.js";

const ALICUOTAS: { valor: AlicuotaIva; etiqueta: string }[] = [
  { valor: "21", etiqueta: "21 %" },
  { valor: "10.5", etiqueta: "10,5 %" },
  { valor: "27", etiqueta: "27 %" },
  { valor: "5", etiqueta: "5 %" },
  { valor: "2.5", etiqueta: "2,5 %" },
  { valor: "0", etiqueta: "0 %" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "no_gravado", etiqueta: "No gravado" },
];

const itemSchema = z.object({
  // Vacío = línea de texto libre, sin producto del catálogo.
  productoId: z.string(),
  descripcion: z.string().trim().min(1, "Poné una descripción"),
  cantidad: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Cantidad mayor a cero"),
  precioUnitario: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Usá punto decimal, máximo 2 decimales"),
  alicuotaIva: z.enum(["0", "2.5", "5", "10.5", "21", "27", "exento", "no_gravado"]),
});

const ventaSchema = z.object({
  clase: z.enum(["factura", "nota_credito", "nota_debito"]),
  clienteId: z.string().min(1, "Elegí un cliente"),
  puntoVenta: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "Punto de venta inválido"),
  numero: z.string().trim(),
  fechaEmision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha"),
  condicionVentaDias: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) <= 365, "Días entre 0 y 365"),
  cae: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{14}$/.test(v), "El CAE son 14 dígitos"),
  caeVencimiento: z.string().trim(),
  items: z.array(itemSchema).min(1, "Cargá al menos un ítem"),
});

type ValoresVenta = z.infer<typeof ventaSchema>;

const ITEM_VACIO = {
  productoId: "",
  descripcion: "",
  cantidad: "1",
  precioUnitario: "",
  alicuotaIva: "21" as const,
};

/**
 * Vista previa con la MISMA función que usa el backend: el total que ve el
 * usuario mientras carga es exactamente el que se va a persistir.
 */
function totalesPreview(items: ValoresVenta["items"]) {
  const validos = items.filter(
    (i) => /^\d+(\.\d{1,3})?$/.test(i.cantidad) && /^\d+(\.\d{1,2})?$/.test(i.precioUnitario),
  );
  if (validos.length === 0) {
    return null;
  }
  return calcularComprobante(validos, "ARS");
}

/**
 * Los valores con los que arranca el formulario cuando viene de un archivo.
 *
 * Lo que no se pudo leer queda **vacío**, nunca con un valor por defecto: un
 * campo precargado se lee como un dato que alguien confirmó, y acá todavía no
 * lo confirmó nadie. El CAE y su vencimiento se guardan tal como vinieron: son
 * la única autorización que lleva el comprobante mientras se emita en ARCA.
 */
/** El reparo de ese campo, listo para mostrar debajo del input. */
function ayudaDe(lectura: LecturaVenta | null, campo: string): string | undefined {
  const reparo = lectura?.propuesta.reparos.find((r) => r.campo === campo);
  return reparo ? textoReparo(reparo) : undefined;
}

/**
 * Lo que hay que mirar antes de guardar.
 *
 * El total impreso va a la vista aunque no se guarde: lo que se persiste sale
 * de los ítems, y tenerlo al lado es lo que permite ver de un vistazo si la
 * lectura cerró.
 */
function AvisoLectura({ lectura }: { lectura: LecturaVenta }) {
  const { propuesta } = lectura;
  const { reparos } = propuesta;
  return (
    <div className="mb-4 flex max-w-4xl gap-2.5 rounded-lg border border-border bg-surface-muted p-3">
      {reparos.length > 0 ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <FileCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      )}
      <div className="text-sm">
        <p className="font-medium text-foreground">
          Leído de <span className="font-normal">{lectura.archivo.nombre}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {reparos.length === 0
            ? "Todo se entendió. Revisalo igual antes de guardar: nada se carga solo."
            : `Hay ${reparos.length} ${reparos.length === 1 ? "dato" : "datos"} para revisar, marcados abajo.`}
        </p>
        {propuesta.totalImpreso !== null && (
          <p className="mt-1 text-muted-foreground">
            El papel dice{" "}
            <span className="tabular font-medium text-foreground">
              {formatearImporte(propuesta.totalImpreso)}
            </span>
            . El total que se guarda se calcula de los ítems: si no coinciden, algún ítem se leyó
            mal.
          </p>
        )}
        {lectura.contraparteId === null && propuesta.receptorRazonSocial !== "" && (
          <p className="mt-1 text-muted-foreground">
            El comprobante es para{" "}
            <strong className="font-medium">{propuesta.receptorRazonSocial}</strong>
            {propuesta.receptorCuit !== null && ` (CUIT ${propuesta.receptorCuit})`}, que no está
            cargado como cliente. Elegilo de la lista o crealo primero.
          </p>
        )}
        {propuesta.items.some((i) => i.alicuotaIva === null) && (
          <p className="mt-1 text-muted-foreground">
            El comprobante lleva el IVA incluido en el precio y no dice a qué tasa, así que la
            alícuota quedó en 21 % y el precio unitario está cargado con el IVA adentro. Revisá los
            dos: de ellos sale el total que se guarda.
          </p>
        )}
      </div>
    </div>
  );
}

function valoresIniciales(lectura?: LecturaVenta | null): ValoresVenta {
  const p = lectura?.propuesta;
  return {
    clase: p?.clase ?? "factura",
    clienteId: lectura?.contraparteId ?? "",
    puntoVenta: p?.puntoVenta === null || p?.puntoVenta === undefined ? "1" : String(p.puntoVenta),
    numero: p?.numero === null || p?.numero === undefined ? "" : String(p.numero),
    fechaEmision: p?.fechaEmision ?? hoyEnArgentina(),
    condicionVentaDias: "30",
    cae: p?.cae ?? "",
    caeVencimiento: p?.caeVencimiento ?? "",
    items:
      p && p.items.length > 0
        ? p.items.map((i) => ({
            // El producto no se vincula solo: vincularlo es lo que hace que al
            // confirmar la factura se descuente stock, y eso lo decide una
            // persona. Una factura vieja se carga sin tocar la mercadería.
            productoId: "",
            descripcion: i.descripcion,
            cantidad: i.cantidad ?? "",
            precioUnitario: i.precioUnitario ?? "",
            alicuotaIva: (i.alicuotaIva ?? "21") as AlicuotaIva,
          }))
        : [ITEM_VACIO],
  };
}

/**
 * La pantalla, que es la que recuerda la lectura.
 *
 * El formulario va aparte y con `key`: TanStack Form toma los `defaultValues`
 * una sola vez, al montarse, así que la única forma de precargarlo con lo
 * leído es montarlo de nuevo. Sin esto el archivo se lee bien y el formulario
 * queda vacío.
 */
export function FormularioComprobante() {
  const [lectura, setLectura] = useState<LecturaVenta | null>(null);
  return (
    <FormularioVenta
      key={lectura?.archivo.hash ?? "manual"}
      lectura={lectura}
      onLeido={setLectura}
    />
  );
}

function FormularioVenta({
  lectura,
  onLeido,
}: {
  lectura: LecturaVenta | null;
  onLeido: (lectura: LecturaVenta) => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clientes = useQuery(trpc.clientes.listar.queryOptions({ pagina: 1, tamanoPagina: 100 }));
  const productos = useQuery(
    trpc.stock.listar.queryOptions({ soloReponer: false, pagina: 1, tamanoPagina: 100 }),
  );
  const crear = useMutation(trpc.comprobantes.ventas.crear.mutationOptions());

  const form = useForm({
    defaultValues: valoresIniciales(lectura),
    validators: { onBlur: ventaSchema },
    onSubmit: async ({ value }) => {
      await crear.mutateAsync({
        clase: value.clase,
        clienteId: value.clienteId,
        puntoVenta: Number(value.puntoVenta),
        numero: value.numero ? Number(value.numero) : null,
        fechaEmision: value.fechaEmision,
        condicionVentaDias: Number(value.condicionVentaDias),
        moneda: "ARS",
        ...(value.cae ? { cae: value.cae } : {}),
        ...(value.caeVencimiento ? { caeVencimiento: value.caeVencimiento } : {}),
        items: value.items.map((i) => ({
          productoId: i.productoId || null,
          descripcion: i.descripcion.trim(),
          cantidad: i.cantidad.trim(),
          precioUnitario: i.precioUnitario.trim(),
          alicuotaIva: i.alicuotaIva,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.comprobantes.pathKey() });
      await navigate({ to: "/comprobantes" });
    },
  });

  return (
    <>
      <Link
        to="/comprobantes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a comprobantes
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <EncabezadoPagina
          titulo="Nuevo comprobante"
          descripcion="La letra se determina sola por la condición IVA del cliente. Se crea en borrador."
        />
        <BotonLeerComprobante<LecturaVenta> tipo="venta" onLeido={onLeido} />
      </div>

      {lectura && <AvisoLectura lectura={lectura} />}

      <Tarjeta className="max-w-4xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-6"
        >
          <fieldset className="space-y-5 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Encabezado
            </legend>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <form.Field name="clase">
                {(field) => (
                  <Campo etiqueta="Clase">
                    {({ id }) => (
                      <Selector
                        id={id}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value as ValoresVenta["clase"])
                        }
                      >
                        <option value="factura">Factura</option>
                        <option value="nota_credito">Nota de crédito</option>
                        <option value="nota_debito">Nota de débito</option>
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="clienteId">
                {(field) => (
                  <Campo
                    etiqueta="Cliente"
                    requerido
                    ayuda="Define la letra del comprobante"
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
                        <option value="">Elegí un cliente</option>
                        {clientes.data?.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.razonSocial}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="fechaEmision">
                {(field) => (
                  <Campo
                    etiqueta="Fecha de emisión"
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

              <form.Field name="puntoVenta">
                {(field) => (
                  <Campo
                    etiqueta="Punto de venta"
                    requerido
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

              <form.Field name="numero">
                {(field) => (
                  <Campo etiqueta="Número" ayuda="Lo asignará ARCA al emitir">
                    {({ id }) => (
                      <Entrada
                        id={id}
                        inputMode="numeric"
                        className="tabular"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>

              <form.Field name="condicionVentaDias">
                {(field) => (
                  <Campo
                    etiqueta="Condición de venta (días)"
                    requerido
                    ayuda="0 = contado"
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

              <form.Field name="cae">
                {(field) => (
                  <Campo
                    etiqueta="CAE"
                    ayuda={ayudaDe(lectura, "cae") ?? "Si ya se emitió en ARCA"}
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

              <form.Field name="caeVencimiento">
                {(field) => (
                  <Campo etiqueta="Vencimiento del CAE">
                    {({ id }) => (
                      <Entrada
                        id={id}
                        type="date"
                        className="tabular"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </Campo>
                )}
              </form.Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Ítems
            </legend>

            <form.Field name="items" mode="array">
              {(campoItems) => (
                <div className="space-y-3">
                  {campoItems.state.value.map((_, indice) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: el índice es la identidad de la fila
                      key={indice}
                      className="grid items-end gap-3 rounded-lg border border-border bg-surface-muted/40 p-3 sm:grid-cols-[1fr_5rem_8rem_8rem_auto]"
                    >
                      {/*
                        Elegir el producto es lo que lo vincula: el ítem guarda
                        su id, y de ahí salen el costo para el margen y la
                        salida de stock. Antes había sólo una lista de
                        sugerencias para el texto, que dejaba todos los ítems
                        como texto libre aunque el nombre coincidiera.
                      */}
                      <form.Field name={`items[${indice}].productoId`}>
                        {(field) => (
                          <div className="sm:col-span-5">
                            <Campo etiqueta="Producto">
                              {({ id }) => (
                                <Selector
                                  id={id}
                                  value={field.state.value}
                                  onChange={(e) => {
                                    const elegido = productos.data?.items.find(
                                      (p) => p.id === e.target.value,
                                    );
                                    field.handleChange(e.target.value);
                                    if (elegido) {
                                      form.setFieldValue(
                                        `items[${indice}].descripcion`,
                                        elegido.descripcion,
                                      );
                                      if (elegido.precioVenta) {
                                        form.setFieldValue(
                                          `items[${indice}].precioUnitario`,
                                          elegido.precioVenta,
                                        );
                                      }
                                    }
                                  }}
                                >
                                  <option value="">Sin producto (texto libre)</option>
                                  {productos.data?.items.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.sku} — {p.descripcion}
                                    </option>
                                  ))}
                                </Selector>
                              )}
                            </Campo>
                          </div>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].descripcion`}>
                        {(field) => (
                          <Campo etiqueta="Descripción" requerido>
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

                      <form.Field name={`items[${indice}].cantidad`}>
                        {(field) => (
                          <Campo etiqueta="Cant.">
                            {({ id }) => (
                              <Entrada
                                id={id}
                                inputMode="decimal"
                                className="tabular"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].precioUnitario`}>
                        {(field) => (
                          <Campo etiqueta="Precio unit.">
                            {({ id }) => (
                              <Entrada
                                id={id}
                                inputMode="decimal"
                                placeholder="0.00"
                                className="tabular"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <form.Field name={`items[${indice}].alicuotaIva`}>
                        {(field) => (
                          <Campo etiqueta="IVA">
                            {({ id }) => (
                              <Selector
                                id={id}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value as AlicuotaIva)}
                              >
                                {ALICUOTAS.map((a) => (
                                  <option key={a.valor} value={a.valor}>
                                    {a.etiqueta}
                                  </option>
                                ))}
                              </Selector>
                            )}
                          </Campo>
                        )}
                      </form.Field>

                      <Boton
                        variante="fantasma"
                        tamano="icono"
                        aria-label={`Quitar ítem ${indice + 1}`}
                        disabled={campoItems.state.value.length === 1}
                        onClick={() => campoItems.removeValue(indice)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Boton>
                    </div>
                  ))}

                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => campoItems.pushValue(ITEM_VACIO)}
                  >
                    Agregar ítem
                  </Boton>
                </div>
              )}
            </form.Field>
          </fieldset>

          <form.Subscribe selector={(s) => s.values.items}>
            {(items) => {
              const totales = totalesPreview(items);
              return (
                <div className="rounded-lg border border-border bg-surface-muted px-4 py-3">
                  {totales === null ? (
                    <p className="text-sm text-muted-foreground">
                      Cargá cantidad y precio para ver los totales.
                    </p>
                  ) : (
                    <dl className="space-y-1 text-sm">
                      {totales.porAlicuota.map((g) => (
                        <div
                          key={g.alicuota}
                          className="flex justify-between text-muted-foreground"
                        >
                          <dt>
                            IVA {g.alicuota.replace(".", ",")} % sobre{" "}
                            {formatearImporte(g.baseImponible.aStringFiscal())}
                          </dt>
                          <dd className="tabular">{formatearImporte(g.importe.aStringFiscal())}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between text-muted-foreground">
                        <dt>Neto</dt>
                        <dd className="tabular">
                          {formatearImporte(totales.neto.aStringFiscal())}
                        </dd>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
                        <dt>Total</dt>
                        <dd className="tabular">
                          {formatearImporte(totales.total.aStringFiscal())}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              );
            }}
          </form.Subscribe>

          <form.Subscribe
            selector={(s) => ({
              clienteId: s.values.clienteId,
              clase: s.values.clase,
              items: s.values.items,
            })}
          >
            {(v) => {
              const cliente = clientes.data?.items.find((c) => c.id === v.clienteId);
              const totales = totalesPreview(v.items);
              // Una nota de crédito baja la deuda: no puede pasar el límite.
              if (!cliente?.limiteCredito || v.clase === "nota_credito") {
                return null;
              }
              const limite = Money.desdeString(cliente.limiteCredito, "ARS");
              const despues = Money.desdeString(cliente.saldo, "ARS").sumar(
                totales?.total ?? Money.cero("ARS"),
              );
              if (!despues.mayorQue(limite)) {
                return null;
              }
              return (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-foreground"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>
                    Con este comprobante, {cliente.razonSocial} quedaría debiendo{" "}
                    <span className="font-medium tabular">
                      {formatearImporte(despues.aStringFiscal())}
                    </span>
                    , más que su límite de crédito de{" "}
                    <span className="tabular">{formatearImporte(cliente.limiteCredito)}</span>. Se
                    puede guardar igual: es un aviso.
                  </span>
                </p>
              );
            }}
          </form.Subscribe>

          {crear.isError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              No se pudo guardar: {mensajeDeError(crear.error)}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
            <Link to="/comprobantes" className={clasesBoton("secundario", "sm")}>
              Cancelar
            </Link>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(enviando) => (
                <Boton type="submit" tamano="sm" cargando={enviando}>
                  Crear borrador
                </Boton>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
