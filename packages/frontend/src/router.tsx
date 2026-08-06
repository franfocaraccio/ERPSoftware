import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout.js";
import { FormularioCliente } from "./features/clientes/formulario.js";
import { ListaClientes } from "./features/clientes/lista.js";
import { Panel } from "./features/panel/panel.js";

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

const arbolRutas = rutaRaiz.addChildren([
  rutaPanel,
  rutaClientes,
  rutaClienteNuevo,
  rutaClienteEditar,
]);

export const router = createRouter({ routeTree: arbolRutas });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
