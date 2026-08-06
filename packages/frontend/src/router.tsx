import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout.js";
import { FormularioCliente } from "./features/clientes/formulario.js";
import { ListaClientes } from "./features/clientes/lista.js";
import { DetalleComprobante } from "./features/comprobantes/detalle.js";
import { FormularioComprobante } from "./features/comprobantes/formulario.js";
import { Comprobantes } from "./features/comprobantes/index.js";
import { FormularioImpuesto } from "./features/impuestos/formulario.js";
import { ListaImpuestos } from "./features/impuestos/lista.js";
import { Panel } from "./features/panel/panel.js";
import { FormularioProveedor } from "./features/proveedores/formulario.js";
import { ListaProveedores } from "./features/proveedores/lista.js";
import { FormularioProducto } from "./features/stock/formulario.js";
import { ListaStock } from "./features/stock/lista.js";
import { Tesoreria } from "./features/tesoreria/index.js";

const rutaRaiz = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const rutaPanel = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/",
  component: Panel,
});

const rutaClientes = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/clientes",
  component: ListaClientes,
});

const rutaClienteNuevo = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/clientes/nuevo",
  component: () => <FormularioCliente />,
});

const rutaClienteEditar = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/clientes/$clienteId",
  component: function EditarCliente() {
    const { clienteId } = rutaClienteEditar.useParams();
    return <FormularioCliente clienteId={clienteId} />;
  },
});

const rutaProveedores = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/proveedores",
  component: ListaProveedores,
});

const rutaProveedorNuevo = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/proveedores/nuevo",
  component: () => <FormularioProveedor />,
});

const rutaProveedorEditar = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/proveedores/$proveedorId",
  component: function EditarProveedor() {
    const { proveedorId } = rutaProveedorEditar.useParams();
    return <FormularioProveedor proveedorId={proveedorId} />;
  },
});

const rutaStock = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/stock",
  component: ListaStock,
});

const rutaProductoNuevo = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/stock/nuevo",
  component: () => <FormularioProducto />,
});

const rutaProductoEditar = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/stock/$productoId",
  component: function EditarProducto() {
    const { productoId } = rutaProductoEditar.useParams();
    return <FormularioProducto productoId={productoId} />;
  },
});

const rutaImpuestos = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/impuestos",
  component: ListaImpuestos,
});

const rutaImpuestoNuevo = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/impuestos/nueva",
  component: () => <FormularioImpuesto />,
});

const rutaImpuestoEditar = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/impuestos/$impuestoId",
  component: function EditarImpuesto() {
    const { impuestoId } = rutaImpuestoEditar.useParams();
    return <FormularioImpuesto impuestoId={impuestoId} />;
  },
});

const rutaTesoreria = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/tesoreria",
  component: Tesoreria,
});

const rutaComprobantes = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/comprobantes",
  component: Comprobantes,
});

const rutaComprobanteNuevo = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/comprobantes/nuevo",
  component: FormularioComprobante,
});

const rutaComprobanteDetalle = createRoute({
  getParentRoute: () => rutaRaiz,
  path: "/comprobantes/$comprobanteId",
  component: function VerComprobante() {
    const { comprobanteId } = rutaComprobanteDetalle.useParams();
    return <DetalleComprobante comprobanteId={comprobanteId} />;
  },
});

const arbolRutas = rutaRaiz.addChildren([
  rutaPanel,
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
]);

export const router = createRouter({ routeTree: arbolRutas });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
