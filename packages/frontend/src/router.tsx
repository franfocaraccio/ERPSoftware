import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout.js";
import { Guardia, useRolOrganizacion } from "./components/sesion.js";
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
  component: () => <FormularioCliente />,
});

const rutaClienteEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/clientes/$clienteId",
  component: function EditarCliente() {
    const { clienteId } = rutaClienteEditar.useParams();
    return <FormularioCliente clienteId={clienteId} />;
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
  component: () => <FormularioProveedor />,
});

const rutaProveedorEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/proveedores/$proveedorId",
  component: function EditarProveedor() {
    const { proveedorId } = rutaProveedorEditar.useParams();
    return <FormularioProveedor proveedorId={proveedorId} />;
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
  component: () => <FormularioProducto />,
});

const rutaProductoEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/stock/$productoId",
  component: function EditarProducto() {
    const { productoId } = rutaProductoEditar.useParams();
    return <FormularioProducto productoId={productoId} />;
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
  component: () => <FormularioImpuesto />,
});

const rutaImpuestoEditar = createRoute({
  getParentRoute: () => rutaApp,
  path: "/impuestos/$impuestoId",
  component: function EditarImpuesto() {
    const { impuestoId } = rutaImpuestoEditar.useParams();
    return <FormularioImpuesto impuestoId={impuestoId} />;
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
  component: FormularioComprobante,
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
  rutaAceptarInvitacion,
  rutaAdmin,
  rutaApp.addChildren([
    rutaPanel,
    rutaEquipo,
    rutaParametros,
    rutaAuditoria,
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
