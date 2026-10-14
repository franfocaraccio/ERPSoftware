import { Boton, Campo, cn, EstadoVacio, Insignia, Selector, Tarjeta } from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, FileSpreadsheet, Landmark, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { SelectorDensidad } from "../../components/selector-densidad.js";
import { useModoLectura } from "../../components/sesion.js";
import {
  aEnviar,
  aTodasLasSinPar,
  type Decision,
  decisionesIniciales,
  pareceOtraCuenta,
  resumir,
} from "../../lib/conciliacion.js";
import { clasesCelda, clasesEncabezado, useDensidad } from "../../lib/densidad.js";
import { type Propuesta, type PropuestaLinea, subirExtracto } from "../../lib/extracto.js";
import { formatearFecha, formatearImporte } from "../../lib/formato.js";
import { useTRPC } from "../../lib/trpc.js";

/**
 * Conciliar una cuenta contra el extracto del banco.
 *
 * Tres pasos: elegir la cuenta y subir el Excel, revisar qué propone el
 * sistema para cada línea, y confirmar. Hasta el último paso no se escribe
 * nada, y en el último se escribe sólo lo que la persona dejó marcado.
 *
 * Cada extracto carga sólo su lado. Una transferencia entre dos cuentas
 * propias aparece como egreso en un extracto y como ingreso en el otro: no se
 * inventa el lado de una cuenta cuyo extracto no se subió.
 */
export function Conciliacion() {
  const soloLectura = useModoLectura();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cuentas = useQuery(trpc.tesoreria.cuentas.listar.queryOptions());
  const confirmar = useMutation(trpc.tesoreria.conciliacion.confirmar.mutationOptions());

  const [cuentaId, setCuentaId] = useState("");
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [decisiones, setDecisiones] = useState<Map<number, Decision>>(new Map());
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const [densidad, setDensidad] = useDensidad("conciliacion");

  if (soloLectura) {
    return (
      <EstadoVacio
        icono={<Landmark className="size-8" aria-hidden="true" />}
        titulo="Conciliar no está disponible con tu acceso"
        descripcion="Conciliar crea y marca movimientos, y tu rol es de solo lectura."
      />
    );
  }

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !cuentaId) {
      return;
    }
    setError(null);
    setHecho(null);
    setLeyendo(true);
    try {
      const p = await subirExtracto(archivo, cuentaId);
      setPropuesta(p);
      setDecisiones(decisionesIniciales(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el extracto.");
    } finally {
      setLeyendo(false);
    }
  }

  async function alConfirmar() {
    if (!propuesta) {
      return;
    }
    setError(null);
    try {
      const r = await confirmar.mutateAsync({
        cuentaId,
        archivoHash: propuesta.archivo.hash,
        decisiones: aEnviar(propuesta, decisiones),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.tesoreria.pathKey() });
      setHecho(
        [
          r.conciliadas > 0 && `${r.conciliadas} conciliadas`,
          r.creadas > 0 && `${r.creadas} creadas`,
          r.ignoradas > 0 && `${r.ignoradas} ignoradas`,
          r.repetidas > 0 && `${r.repetidas} ya estaban hechas`,
        ]
          .filter(Boolean)
          .join(", "),
      );
      setPropuesta(null);
      setDecisiones(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar la conciliación.");
    }
  }

  const resumen = resumir(decisiones);
  const aAplicar = resumen.conciliar + resumen.crear + resumen.ignorar;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Cuenta">
          {({ id }) => (
            <Selector
              id={id}
              value={cuentaId}
              onChange={(e) => {
                setCuentaId(e.target.value);
                setPropuesta(null);
                setHecho(null);
              }}
              disabled={leyendo}
            >
              <option value="">Elegí la cuenta del extracto</option>
              {cuentas.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda})
                </option>
              ))}
            </Selector>
          )}
        </Campo>
        <input
          ref={entradaRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => void alElegir(e)}
        />
        <Boton
          tamano="sm"
          cargando={leyendo}
          disabled={!cuentaId}
          onClick={() => entradaRef.current?.click()}
        >
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          {leyendo ? "Leyendo el extracto…" : "Subir extracto (.xlsx)"}
        </Boton>
        {propuesta && (
          <div className="ml-auto">
            <SelectorDensidad valor={densidad} onCambio={setDensidad} />
          </div>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {hecho !== null && (
        <Tarjeta className="mb-4 flex items-center gap-2.5 p-4 text-sm">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="text-foreground">Listo: {hecho}.</span>
        </Tarjeta>
      )}

      {propuesta === null && hecho === null && (
        <EstadoVacio
          icono={<Landmark className="size-8" aria-hidden="true" />}
          titulo="Conciliá una cuenta con su extracto"
          descripcion="Elegí la cuenta y subí el Excel que exporta el banco. Se propone qué es cada línea, y no se carga nada hasta que confirmes."
        />
      )}

      {propuesta && (
        <>
          <AvisoExtracto propuesta={propuesta} />

          {pareceOtraCuenta(propuesta) && (
            <Tarjeta className="mb-4 flex gap-2.5 border-danger/40 p-4 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">
                  Ninguna línea coincide con lo cargado en esta cuenta
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Puede ser que el extracto sea de otra cuenta —fijate el bloque del banco, arriba—
                  o que sea la primera vez que conciliás esta. Por las dudas no quedó nada marcado
                  para crear: elegí qué hacer con cada línea, o con todas juntas abajo.
                </p>
              </div>
            </Tarjeta>
          )}

          {propuesta.lineas.some((l) => l.resultado === "sin_par") && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Las {propuesta.lineas.filter((l) => l.resultado === "sin_par").length} que no están
                cargadas:
              </span>
              {(
                [
                  ["crear", "Crearlas todas"],
                  ["ignorar", "Ignorarlas todas"],
                  ["despues", "Dejarlas para después"],
                ] as const
              ).map(([accion, etiqueta]) => (
                <Boton
                  key={accion}
                  tamano="sm"
                  variante="secundario"
                  onClick={() => setDecisiones(aTodasLasSinPar(propuesta, decisiones, accion))}
                >
                  {etiqueta}
                </Boton>
              ))}
            </div>
          )}

          {propuesta.lineas.length === 0 ? (
            <EstadoVacio
              icono={<CircleCheck className="size-8" aria-hidden="true" />}
              titulo="No queda nada por conciliar"
              descripcion="Todas las líneas de este extracto ya se resolvieron con uno anterior."
            />
          ) : (
            <Tarjeta className="mb-4 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Fecha", "Movimiento del banco", "Importe", "Qué hacer"].map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={cn(
                            clasesEncabezado(densidad),
                            "text-xs font-medium tracking-wide text-muted-foreground uppercase",
                            i === 2 ? "text-right" : "text-left",
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {propuesta.lineas.map((l) => (
                      <FilaLinea
                        key={l.indice}
                        linea={l}
                        propuesta={propuesta}
                        decision={decisiones.get(l.indice) ?? { accion: "despues" }}
                        densidad={densidad}
                        onCambio={(d) => setDecisiones(new Map(decisiones).set(l.indice, d))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {propuesta.sinLinea.length > 0 && <SinLinea propuesta={propuesta} />}

          {propuesta.lineas.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-sm text-muted-foreground">
                {resumen.conciliar} a conciliar · {resumen.crear} a crear · {resumen.ignorar} a
                ignorar
                {resumen.despues > 0 && ` · ${resumen.despues} quedan para después`}
              </p>
              <Boton
                tamano="sm"
                cargando={confirmar.isPending}
                disabled={aAplicar === 0}
                onClick={() => void alConfirmar()}
              >
                Confirmar {aAplicar} {aAplicar === 1 ? "decisión" : "decisiones"}
              </Boton>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * De qué archivo se trata y si se leyó bien.
 *
 * El bloque del banco va a la vista para que la persona vea que subió el
 * extracto de la cuenta que eligió: el sistema no guarda el número de cuenta
 * del banco, así que no lo puede comparar solo.
 */
function AvisoExtracto({ propuesta }: { propuesta: Propuesta }) {
  const { saldo } = propuesta;
  return (
    <Tarjeta className="mb-4 p-4 text-sm">
      <p className="font-medium text-foreground">{propuesta.archivo.nombre}</p>
      {propuesta.cuenta.length > 0 && (
        <p className="mt-0.5 text-muted-foreground">{propuesta.cuenta.join(" · ")}</p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {saldo.ok ? (
          <p className="flex items-center gap-2 text-foreground">
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
            El saldo cierra línea por línea: arranca en{" "}
            <span className="tabular">{formatearImporte(saldo.inicial)}</span> y termina en{" "}
            <span className="tabular">{formatearImporte(saldo.final)}</span>, como dice el banco.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <span>
              El saldo se corta en la línea {saldo.indice + 1}: con las anteriores debería dar{" "}
              <span className="tabular">{formatearImporte(saldo.esperado)}</span> y el banco dice{" "}
              <span className="tabular">{formatearImporte(saldo.leido)}</span>. Falta una línea o
              hay un importe mal leído: revisá el archivo antes de confirmar.
            </span>
          </p>
        )}
        {propuesta.yaResueltas > 0 && (
          <p className="text-muted-foreground">
            {propuesta.yaResueltas}{" "}
            {propuesta.yaResueltas === 1
              ? "línea ya estaba resuelta"
              : "líneas ya estaban resueltas"}{" "}
            con un extracto anterior y no se vuelven a mostrar.
          </p>
        )}
        {propuesta.filasIlegibles.length > 0 && (
          <p className="flex items-start gap-2 text-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            No se pudieron leer las filas {propuesta.filasIlegibles.map((f) => f.fila).join(", ")}{" "}
            del Excel.
          </p>
        )}
      </div>
    </Tarjeta>
  );
}

/** Cómo se escribe una decisión en el `<select>`. */
function aValor(d: Decision): string {
  return d.accion === "conciliar" ? `conciliar:${d.movimientoId}` : d.accion;
}

function deValor(valor: string): Decision {
  if (valor.startsWith("conciliar:")) {
    return { accion: "conciliar", movimientoId: valor.slice("conciliar:".length) };
  }
  return { accion: valor as "crear" | "ignorar" | "despues" };
}

function FilaLinea({
  linea,
  propuesta,
  decision,
  densidad,
  onCambio,
}: {
  linea: PropuestaLinea;
  propuesta: Propuesta;
  decision: Decision;
  densidad: Parameters<typeof clasesCelda>[0];
  onCambio: (d: Decision) => void;
}) {
  const esDebito = linea.importe.startsWith("-");
  // Los movimientos que se pueden elegir: el que casa, o los candidatos.
  const opciones =
    linea.resultado === "casa" && linea.movimientoId ? [linea.movimientoId] : linea.candidatos;

  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className={cn(clasesCelda(densidad), "tabular whitespace-nowrap text-muted-foreground")}>
        {formatearFecha(linea.fecha)}
      </td>
      <td className={cn(clasesCelda(densidad), "text-foreground")}>
        <span className="block">{linea.descripcion}</span>
        <EtiquetaResultado linea={linea} />
      </td>
      <td
        className={cn(
          clasesCelda(densidad),
          "tabular text-right whitespace-nowrap",
          esDebito ? "text-foreground" : "text-success",
        )}
      >
        {formatearImporte(linea.importe)}
      </td>
      <td className={cn(clasesCelda(densidad), "min-w-[16rem]")}>
        <Selector
          aria-label={`Qué hacer con la línea del ${formatearFecha(linea.fecha)}`}
          value={aValor(decision)}
          onChange={(e) => onCambio(deValor(e.target.value))}
        >
          {opciones.map((id) => {
            const m = propuesta.movimientos[id];
            return (
              <option key={id} value={`conciliar:${id}`}>
                Conciliar con{" "}
                {m ? `${formatearFecha(m.fecha)} — ${m.concepto ?? "sin concepto"}` : id}
              </option>
            );
          })}
          <option value="crear">
            {linea.sugerencia
              ? `Crear el movimiento (${linea.sugerencia.nombre})`
              : "Crear el movimiento"}
          </option>
          <option value="ignorar">Ignorar: no es de la empresa</option>
          <option value="despues">Dejar para después</option>
        </Selector>
      </td>
    </tr>
  );
}

function EtiquetaResultado({ linea }: { linea: PropuestaLinea }) {
  if (linea.resultado === "casa") {
    return (
      <Insignia tono="exito" className="mt-1">
        Ya cargado
      </Insignia>
    );
  }
  if (linea.resultado === "ambigua") {
    return (
      <Insignia tono="advertencia" className="mt-1">
        {linea.candidatos.length} movimientos posibles: elegí cuál
      </Insignia>
    );
  }
  return (
    <Insignia tono="neutro" className="mt-1">
      No está cargado
      {linea.sugerencia &&
        ` · ${linea.sugerencia.contraparte === "cliente" ? "cliente" : "proveedor"} por el CUIT`}
    </Insignia>
  );
}

/**
 * Lo que está cargado en el período y el banco no muestra.
 *
 * No hay nada que confirmar acá: es para mirar. Es un tipeo, o algo que todavía
 * no se acreditó, como un cheque depositado ayer.
 */
function SinLinea({ propuesta }: { propuesta: Propuesta }) {
  return (
    <Tarjeta className="mb-4 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
        Cargado en el sistema pero no en el banco
      </p>
      <p className="mt-0.5 text-muted-foreground">
        Puede ser un error de carga o algo que todavía no se acreditó. No se toca nada: es para
        revisarlo.
      </p>
      <ul className="mt-2 space-y-1">
        {propuesta.sinLinea.map((id) => {
          const m = propuesta.movimientos[id];
          if (!m) {
            return null;
          }
          return (
            <li key={id} className="flex justify-between gap-4">
              <span className="text-foreground">
                {formatearFecha(m.fecha)} — {m.concepto ?? "sin concepto"}
              </span>
              <span className="tabular text-muted-foreground">
                {m.tipo === "egreso" ? "−" : ""}
                {formatearImporte(m.importe)}
              </span>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}
