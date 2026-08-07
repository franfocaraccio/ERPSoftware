import { EstadoVacio, Tarjeta } from "@erp/design-system";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Layout } from "./components/layout.js";
import { Guardia, useModoLectura, useRolOrganizacion } from "./components/sesion.js";
import { PanelAdmin } from "./features/admin/panel.js";
import { Auditoria, AuditoriaSinPermiso } from "./features/auditoria/lista.js";
import { AceptarInvitacion } from "./features/auth/aceptar-invitacion.js";
import { Login } from "./features/auth/login.js";
import { Recuperar } from "./features/auth/recuperar.js";
import { Restablecer } from "./features/auth/restablecer.js";
import { FormularioCliente } from "./features/clientes/formulario.js";
import { ListaClientes } from "./features/clientes/lista.js";
import { DetalleComprobante } from "./features/comprobantes/detalle.js";
import { FormularioComprobante } from "./features/comprobantes/formulario.js";
import { Comprobantes } from "./features/comprobantes/index.js";
import { Accesos, AccesosSinPermiso } from "./features/consolidado/accesos.js";
import { EntradaConsolidado } from "./features/consolidado/entrada.js";
import { Equipo, EquipoSinPermiso } from "./features/equipo/lista.js";
import { FormularioImpuesto } from "./features/impuestos/formulario.js";
import { ListaImpuestos } from "./features/impuestos/lista.js";
import { Landing } from "./features/landing/landing.js";
import { Panel } from "./features/panel/panel.js";
import { Parametros, ParametrosSinPermiso } from "./features/parametros/formulario.js";
import { FormularioProveedor } from "./features/proveedores/formulario.js";
import { ListaProveedores } from "./features/proveedores/lista.js";
import { FormularioProducto } from "./features/stock/formulario.js";
import { ListaStock } from "./features/stock/lista.js";
import { Tesoreria } from "./features/tesoreria/index.js";

/**
 * Envoltorio para las pantallas que escriben. Sin esto, quien está en modo
 * lectura llega por URL a un formulario que va a fallar recién al guardar.
 *
 * El permiso real lo aplica el backend; esto es para no hacerle perder el
 * tiempo a nadie.
 */
function SoloEscritura({ children }: { children: ReactNode }) {
  const soloLectura = useModoLectura();
  if (!soloLectura) {
    return <>{children}</>;
  }
  return (
    <Tarjeta>
      <EstadoVacio
        icono={<Eye className="size-8" aria-hidden="true" />}
        titulo="Estás viendo en modo lectura"
        descripcion="Tu acceso permite consultar la información, no modificarla."
      />
    </Tarjeta>
  );
}

/** La raíz solo decide si hay sesión; el layout lo pone cada rama. */
const rutaRaiz = createRootRoute({
  component: () => (
    <Guardia>
      <Outlet />
    </Guardia>
  ),
});

// --- Rutas públicas, con su propia pantalla completa ---

/** Portada: lo que ve cualquiera que llega sin sesión. El ERP vive en /panel. */
const rutaLanding = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/",
  component: Landing,
});

const rutaLogin = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/login",
  component: Login,
});

const rutaRecuperar = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/recuperar",
  component: Recuperar,
});

/** El token llega por query: es el link que se manda por mail. */
const rutaRestablecer = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/restablecer",
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: function ElegirPassword() {
    const { token } = rutaRestablecer.useSearch();
    return <Restablecer token={token} />;
  },
});

/** Canje del link de solo lectura. Público: el token es la credencial. */
const rutaConsolidado = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/consolidado/$tenantId/$token",
  component: function AbrirConsolidado() {
    const { tenantId, token } = rutaConsolidado.useParams();
    return <EntradaConsolidado tenantId={tenantId} token={token} />;
  },
});

const rutaAccesos = createRoute({
  getParentRoute: () => rutaApp,
  path: "/accesos",
  component: function GestionAccesos() {
    const rol = useRolOrganizacion();
    return rol === "administrador" ? <Accesos /> : <AccesosSinPermiso />;
  },
});

const rutaAceptarInvitacion = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/aceptar-invitacion/$invitacionId",
  component: function Aceptar() {
    const { invitacionId } = rutaAceptarInvitacion.useParams();
    return <AceptarInvitacion invitacionId={invitacionId} />;
  },
});

/** Panel de plataforma: layout propio, sin el sidebar de módulos. */
const rutaAdmin = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/admin",
  component: PanelAdmin,
});

// --- El ERP, todo bajo el layout con sidebar ---

const rutaApp = createRoute({
  getParentRoute: () => rutaRaiz,
  id: "app",
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const rutaPanel = createRoute({
  getParentRoute: () => rutaApp,
  path: "/panel",
  component: Panel,
});

/**
 * Gestión del equipo. El guard real está en el backend; esto solo evita
 * mostrarle una pantalla rota a quien entra por URL sin ser Administrador.
 */
const rutaEquipo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/equipo",
  component: function GestionEquipo() {
    const rol = useRolOrganizacion();
    return rol === "administrador" ? <Equipo /> : <EquipoSinPermiso />;
  },
});

const rutaAuditoria = createRoute({
  getParentRoute: () => rutaApp,
  path: "/historial",
  component: function HistorialEmpresa() {
    const rol = useRolOrganizacion();
    return rol === "administrador" ? <Auditoria /> : <AuditoriaSinPermiso />;
  },
});

const rutaParametros = createRoute({
  getParentRoute: () => rutaApp,
  path: "/parametros",
  component: function ConfigurarParametros() {
    const rol = useRolOrganizacion();
    return rol === "administrador" ? <Parametros /> : <ParametrosSinPermiso />;
  },
});

const rutaClientes = createRoute({
  getParentRoute: () => rutaApp,
  path: "/clientes",
  component: ListaClientes,
});

const rutaClienteNuevo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/clientes/nuevo",
  component: () => (
    <SoloEscritura>
      <FormularioCliente />
    </SoloEscritura>
  ),
});

const rutaClienteEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/clientes/$clienteId",
  component: function EditarCliente() {
    const { clienteId } = rutaClienteEditar.useParams();
    return (
      <SoloEscritura>
        <FormularioCliente clienteId={clienteId} />
      </SoloEscritura>
    );
  },
});

const rutaProveedores = createRoute({
  getParentRoute: () => rutaApp,
  path: "/proveedores",
  component: ListaProveedores,
});

const rutaProveedorNuevo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/proveedores/nuevo",
  component: () => (
    <SoloEscritura>
      <FormularioProveedor />
    </SoloEscritura>
  ),
});

const rutaProveedorEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/proveedores/$proveedorId",
  component: function EditarProveedor() {
    const { proveedorId } = rutaProveedorEditar.useParams();
    return (
      <SoloEscritura>
        <FormularioProveedor proveedorId={proveedorId} />
      </SoloEscritura>
    );
  },
});

const rutaStock = createRoute({
  getParentRoute: () => rutaApp,
  path: "/stock",
  component: ListaStock,
});

const rutaProductoNuevo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/stock/nuevo",
  component: () => (
    <SoloEscritura>
      <FormularioProducto />
    </SoloEscritura>
  ),
});

const rutaProductoEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/stock/$productoId",
  component: function EditarProducto() {
    const { productoId } = rutaProductoEditar.useParams();
    return (
      <SoloEscritura>
        <FormularioProducto productoId={productoId} />
      </SoloEscritura>
    );
  },
});

const rutaImpuestos = createRoute({
  getParentRoute: () => rutaApp,
  path: "/impuestos",
  component: ListaImpuestos,
});

const rutaImpuestoNuevo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/impuestos/nueva",
  component: () => (
    <SoloEscritura>
      <FormularioImpuesto />
    </SoloEscritura>
  ),
});

const rutaImpuestoEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/impuestos/$impuestoId",
  component: function EditarImpuesto() {
    const { impuestoId } = rutaImpuestoEditar.useParams();
    return (
      <SoloEscritura>
        <FormularioImpuesto impuestoId={impuestoId} />
      </SoloEscritura>
    );
  },
});

const rutaTesoreria = createRoute({
  getParentRoute: () => rutaApp,
  path: "/tesoreria",
  component: Tesoreria,
});

const rutaComprobantes = createRoute({
  getParentRoute: () => rutaApp,
  path: "/comprobantes",
  component: Comprobantes,
});

const rutaComprobanteNuevo = createRoute({
  getParentRoute: () => rutaApp,
  path: "/comprobantes/nuevo",
  component: () => (
    <SoloEscritura>
      <FormularioComprobante />
    </SoloEscritura>
  ),
});

const rutaComprobanteDetalle = createRoute({
  getParentRoute: () => rutaApp,
  path: "/comprobantes/$comprobanteId",
  component: function VerComprobante() {
    const { comprobanteId } = rutaComprobanteDetalle.useParams();
    return <DetalleComprobante comprobanteId={comprobanteId} />;
  },
});

const arbolRutas = rutaRaiz.addChildren([
  rutaLanding,
  rutaLogin,
  rutaRecuperar,
  rutaRestablecer,
  rutaConsolidado,
  rutaAceptarInvitacion,
  rutaAdmin,
  rutaApp.addChildren([
    rutaPanel,
    rutaEquipo,
    rutaParametros,
    rutaAuditoria,
    rutaAccesos,
    rutaClientes,
    rutaClienteNuevo,
    rutaClienteEditar,
    rutaProveedores,
    rutaProveedorNuevo,
    rutaProveedorEditar,
    rutaStock,
    rutaProductoNuevo,
    rutaProductoEditar,
    rutaImpuestos,
    rutaImpuestoNuevo,
    rutaImpuestoEditar,
    rutaTesoreria,
    rutaComprobantes,
    rutaComprobanteNuevo,
    rutaComprobanteDetalle,
  ]),
]);

export const router = createRouter({ routeTree: arbolRutas });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
