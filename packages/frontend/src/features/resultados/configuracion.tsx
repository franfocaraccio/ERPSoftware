import { hoyEnArgentina } from "@erp/core/dates";
import {
  Boton,
  Campo,
  Casilla,
  Entrada,
  Esqueleto,
  Insignia,
  Selector,
  Tarjeta,
} from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useModoLectura } from "../../components/sesion.js";
import { mensajeDeError } from "../../lib/errores.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

const IMPORTE = /^\d+(\.\d{1,2})?$/;

/**
 * Sueldos, alquiler: lo que se paga todos los meses sin comprobante. Sólo se
 * proyecta en la caja; el pago real se registra en Tesorería.
 */
export function GastosRecurrentes() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const soloLectura = useModoLectura();
  const gastos = useQuery(trpc.resultados.recurrentes.listar.queryOptions());
  const categorias = useQuery(trpc.resultados.categorias.listar.queryOptions());
  const cuentas = useQuery(trpc.tesoreria.cuentas.listar.queryOptions());
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState({
    descripcion: "",
    categoriaId: "",
    cuentaId: "",
    importe: "",
    dia: "5",
    desde: hoyEnArgentina(),
    hasta: "",
  });

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.resultados.pathKey() }),
      // Cambia la proyección de caja del panel.
      queryClient.invalidateQueries({ queryKey: trpc.financiero.pathKey() }),
    ]);
  const crear = useMutation({
    ...trpc.resultados.recurrentes.crear.mutationOptions(),
    onSuccess: async () => {
      await refrescar();
      setAbierto(false);
      setV((x) => ({ ...x, descripcion: "", importe: "" }));
    },
  });
  const actualizar = useMutation({
    ...trpc.resultados.recurrentes.actualizar.mutationOptions(),
    onSuccess: refrescar,
  });

  const valido =
    v.descripcion.trim() !== "" &&
    v.cuentaId !== "" &&
    IMPORTE.test(v.importe.trim()) &&
    /^\d+$/.test(v.dia) &&
    Number(v.dia) >= 1 &&
    Number(v.dia) <= 31;
  const nombreCategoria = (id: string | null) =>
    categorias.data?.find((c) => c.id === id)?.nombre ?? "Sin categoría";
  const nombreCuenta = (id: string) => cuentas.data?.items.find((c) => c.id === id)?.nombre ?? "—";

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Gastos recurrentes</h2>
          <p className="text-xs text-muted-foreground">
            Se proyectan en la caja del panel todos los meses. El pago real se registra en
            Tesorería.
          </p>
        </div>
        {!soloLectura && !abierto && (
          <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Agregar
          </Boton>
        )}
      </div>

      {abierto && (
        <form
          className="mx-4 mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) {
              return;
            }
            crear.mutate({
              descripcion: v.descripcion.trim(),
              categoriaId: v.categoriaId || null,
              cuentaId: v.cuentaId,
              importe: v.importe.trim(),
              diaDelMes: Number(v.dia),
              desde: v.desde,
              hasta: v.hasta || null,
              activo: true,
            });
          }}
        >
          <Campo etiqueta="Descripción" requerido>
            {({ id }) => (
              <Entrada
                id={id}
                placeholder="Sueldos de planta"
                value={v.descripcion}
                onChange={(e) => setV({ ...v, descripcion: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Categoría">
            {({ id }) => (
              <Selector
                id={id}
                value={v.categoriaId}
                onChange={(e) => setV({ ...v, categoriaId: e.target.value })}
              >
                <option value="">Sin categoría</option>
                {categorias.data
                  ?.filter((c) => c.tipo === "gasto" && c.activa)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </Selector>
            )}
          </Campo>
          <Campo etiqueta="Cuenta" requerido ayuda="De dónde sale">
            {({ id }) => (
              <Selector
                id={id}
                value={v.cuentaId}
                onChange={(e) => setV({ ...v, cuentaId: e.target.value })}
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
          <Campo etiqueta="Importe" requerido>
            {({ id }) => (
              <Entrada
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                className="tabular"
                value={v.importe}
                onChange={(e) => setV({ ...v, importe: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Día del mes" requerido ayuda="Si el mes es más corto, el último día">
            {({ id }) => (
              <Entrada
                id={id}
                inputMode="numeric"
                className="tabular"
                value={v.dia}
                onChange={(e) => setV({ ...v, dia: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Desde">
            {({ id }) => (
              <Entrada
                id={id}
                type="date"
                className="tabular"
                value={v.desde}
                onChange={(e) => setV({ ...v, desde: e.target.value })}
              />
            )}
          </Campo>
          {crear.isError && (
            <p role="alert" className="text-sm text-danger sm:col-span-3">
              No se pudo guardar: {mensajeDeError(crear.error)}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" tamano="sm" disabled={!valido} cargando={crear.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      )}

      {gastos.isPending ? (
        <Esqueleto className="m-4 h-16" />
      ) : !gastos.data?.length ? (
        <p className="p-4 text-sm text-muted-foreground">
          No hay gastos recurrentes. Cargá sueldos y alquiler para que la proyección de caja los
          tenga en cuenta.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {gastos.data.map((g) => (
                <tr key={g.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{g.descripcion}</span>
                    <span className="block text-xs text-muted-foreground">
                      {nombreCategoria(g.categoriaId)} · {nombreCuenta(g.cuentaId)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    Día {g.diaDelMes} · desde {formatearFecha(g.desde)}
                    {g.hasta ? ` hasta ${formatearFecha(g.hasta)}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular">
                    {formatearImporte(g.importe)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {soloLectura ? (
                      !g.activo && <Insignia>Pausado</Insignia>
                    ) : (
                      <Casilla
                        etiqueta="Activo"
                        checked={g.activo}
                        onChange={(e) =>
                          actualizar.mutate({
                            id: g.id,
                            datos: {
                              descripcion: g.descripcion,
                              categoriaId: g.categoriaId,
                              cuentaId: g.cuentaId,
                              importe: g.importe,
                              diaDelMes: g.diaDelMes,
                              desde: g.desde,
                              hasta: g.hasta,
                              activo: e.target.checked,
                            },
                          })
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

/** El plan de cuentas simple de la empresa: se agrega, se renombra, se desactiva. */
export function Categorias() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const soloLectura = useModoLectura();
  const { data, isPending } = useQuery(trpc.resultados.categorias.listar.queryOptions());
  const [nueva, setNueva] = useState({ nombre: "", tipo: "gasto" as "gasto" | "ingreso" });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: trpc.resultados.pathKey() });
  const crear = useMutation({
    ...trpc.resultados.categorias.crear.mutationOptions(),
    onSuccess: async () => {
      await refrescar();
      setNueva({ ...nueva, nombre: "" });
    },
  });
  const actualizar = useMutation({
    ...trpc.resultados.categorias.actualizar.mutationOptions(),
    onSuccess: refrescar,
  });

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground">Categorías de ingresos y gastos</h2>
        <p className="text-xs text-muted-foreground">
          Se eligen en los movimientos sin cliente ni proveedor y en las compras que son un gasto.
          Una categoría no se borra: se desactiva.
        </p>
      </div>

      {!soloLectura && (
        <form
          className="mx-4 mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nueva.nombre.trim()) {
              crear.mutate({ nombre: nueva.nombre.trim(), tipo: nueva.tipo, activa: true });
            }
          }}
        >
          <Campo etiqueta="Nueva categoría">
            {({ id }) => (
              <Entrada
                id={id}
                className="w-64"
                value={nueva.nombre}
                onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              />
            )}
          </Campo>
          <Selector
            aria-label="Tipo de categoría"
            className="w-32"
            value={nueva.tipo}
            onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as "gasto" | "ingreso" })}
          >
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Selector>
          <Boton type="submit" tamano="sm" cargando={crear.isPending}>
            Agregar
          </Boton>
          {crear.isError && (
            <p role="alert" className="w-full text-sm text-danger">
              {mensajeDeError(crear.error)}
            </p>
          )}
        </form>
      )}

      {isPending ? (
        <Esqueleto className="m-4 h-24" />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className={c.activa ? "text-foreground" : "text-muted-foreground line-through"}>
                {c.nombre}
                <Insignia tono={c.tipo === "gasto" ? "neutro" : "info"} className="ml-2">
                  {c.tipo === "gasto" ? "Gasto" : "Ingreso"}
                </Insignia>
              </span>
              {!soloLectura && (
                <Casilla
                  etiqueta="Activa"
                  checked={c.activa}
                  onChange={(e) =>
                    actualizar.mutate({
                      id: c.id,
                      datos: { nombre: c.nombre, tipo: c.tipo, activa: e.target.checked },
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
