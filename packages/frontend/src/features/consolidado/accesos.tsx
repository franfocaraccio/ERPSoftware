import {
  Boton,
  Campo,
  DialogoConfirmacion,
  Entrada,
  Esqueleto,
  EstadoVacio,
  Insignia,
  Tarjeta,
} from "@erp/design-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { EncabezadoPagina } from "../../components/layout.js";
import { BotonCopiarLink, LinkInvitacion } from "../../components/link-invitacion.js";
import { useTRPC } from "../../lib/trpc.js";

function fechaHora(valor: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(valor));
}

export function Accesos() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(trpc.consolidado.listar.queryOptions());
  const { data: horas } = useQuery(trpc.consolidado.duracionHoras.queryOptions());
  const crear = useMutation(trpc.consolidado.crear.mutationOptions());
  const revocar = useMutation(trpc.consolidado.revocar.mutationOptions());

  const [descripcion, setDescripcion] = useState("");
  const [creando, setCreando] = useState(false);
  const [reciente, setReciente] = useState<{ link: string; descripcion: string } | null>(null);
  const [aRevocar, setARevocar] = useState<{ id: string; descripcion: string } | null>(null);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: trpc.consolidado.pathKey() });

  const generar = async () => {
    const creado = await crear.mutateAsync({ descripcion: descripcion.trim() });
    await refrescar();
    setReciente({ link: creado.link, descripcion: creado.descripcion });
    setDescripcion("");
    setCreando(false);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Accesos de solo lectura"
        descripcion="Links para mostrarle la empresa a alguien que no tiene cuenta."
        acciones={
          !creando && (
            <Boton
              tamano="sm"
              onClick={() => {
                setReciente(null);
                setCreando(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Generar acceso
            </Boton>
          )
        }
      />

      {/* El riesgo se dice antes de generar el primero, no en la letra chica. */}
      <Tarjeta className="mb-4 flex items-start gap-2.5 border-warning/40 bg-warning-subtle p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-foreground">
          Cualquiera que tenga el link ve toda la información de la empresa —facturación, márgenes y
          saldos— sin necesidad de contraseña. Dura {horas ?? 48} horas y podés cortarlo antes desde
          acá.
        </p>
      </Tarjeta>

      {creando && (
        <Tarjeta className="mb-4 p-5">
          <div className="space-y-4">
            <Campo
              etiqueta="¿Para quién es?"
              requerido
              ayuda="Te sirve a vos para saber cuál revocar. Quien entra también lo ve."
            >
              {({ id }) => (
                <Entrada
                  id={id}
                  placeholder="Contador, banco, inversor…"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              )}
            </Campo>

            {crear.isError && (
              <p role="alert" className="text-sm text-danger">
                No se pudo generar: {crear.error.message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Boton variante="secundario" tamano="sm" onClick={() => setCreando(false)}>
                Cancelar
              </Boton>
              <Boton
                tamano="sm"
                cargando={crear.isPending}
                disabled={descripcion.trim() === ""}
                onClick={() => void generar()}
              >
                Generar
              </Boton>
            </div>
          </div>
        </Tarjeta>
      )}

      {reciente && (
        <div className="mb-4">
          <LinkInvitacion link={reciente.link} email={reciente.descripcion} />
        </div>
      )}

      {isError ? (
        <Tarjeta>
          <EstadoVacio
            titulo="No se pudieron cargar los accesos"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => refetch()}>
                Reintentar
              </Boton>
            }
          />
        </Tarjeta>
      ) : isPending ? (
        <div className="space-y-2" role="status" aria-busy="true" aria-label="Cargando accesos">
          {[0, 1].map((i) => (
            <Esqueleto key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={<Eye className="size-8" aria-hidden="true" />}
            titulo="No hay accesos generados"
            descripcion="Generá uno cuando necesites mostrarle la empresa a alguien de afuera."
          />
        </Tarjeta>
      ) : (
        <Tarjeta className="divide-y divide-border">
          {data.map((acceso) => (
            <div key={acceso.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {acceso.descripcion}
                  {acceso.vencido && <Insignia tono="neutro">Vencido</Insignia>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {acceso.vencido ? "Venció" : "Vence"} {fechaHora(acceso.expira)} ·{" "}
                  {acceso.ultimoUso
                    ? `último uso ${fechaHora(acceso.ultimoUso)}`
                    : "todavía no lo usaron"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!acceso.vencido && <BotonCopiarLink link={acceso.link} />}
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => setARevocar({ id: acceso.id, descripcion: acceso.descripcion })}
                >
                  {acceso.vencido ? "Quitar" : "Revocar"}
                </Boton>
              </div>
            </div>
          ))}
        </Tarjeta>
      )}

      <DialogoConfirmacion
        abierto={aRevocar !== null}
        onAbiertoChange={(abierto) => !abierto && setARevocar(null)}
        titulo="Revocar el acceso"
        descripcion={`El link de "${aRevocar?.descripcion ?? ""}" deja de funcionar en el momento, incluso si alguien lo tiene abierto.`}
        textoConfirmar="Revocar"
        destructivo
        cargando={revocar.isPending}
        onConfirmar={async () => {
          if (aRevocar) {
            await revocar.mutateAsync({ id: aRevocar.id });
            await refrescar();
          }
          setARevocar(null);
        }}
      />
    </>
  );
}

/** Para quien entra por URL sin ser Administrador. */
export function AccesosSinPermiso() {
  return (
    <>
      <EncabezadoPagina titulo="Accesos de solo lectura" />
      <Tarjeta>
        <EstadoVacio
          icono={<Eye className="size-8" aria-hidden="true" />}
          titulo="Esta sección es del Administrador"
          descripcion="Los accesos a la información de la empresa los otorga quien la administra."
        />
      </Tarjeta>
    </>
  );
}
