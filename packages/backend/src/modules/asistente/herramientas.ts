import { ESTADOS_COMPROBANTE } from "@erp/core/invoicing";
import { TRPCError } from "@trpc/server";
import { type ToolSet, tool } from "ai";
import { z } from "zod";
import type { Context } from "../../trpc/context.js";
import { appRouter } from "../../trpc/router.js";
import { createCallerFactory } from "../../trpc/trpc.js";
import { MODULOS_AUDITABLES, type ModuloAuditable } from "../auditoria/schema.js";
import { tiposImpuesto } from "../impuestos/schema.js";
import { tiposMovimiento } from "../tesoreria/schema.js";

/**
 * Herramientas del asistente para responder sobre los datos de la empresa
 * (Fase B).
 *
 * Cada herramienta llama a un procedure de **lectura** de la app a través de
 * un caller de tRPC armado con la sesión de quien pregunta. Así hereda todas
 * las reglas de acceso sin copiarlas: el tenant sale de la sesión, un link de
 * solo lectura sólo ve sus módulos y quien no tiene permiso de panel no lo ve
 * tampoco por el chat. Si mañana cambia una regla, el chat la sigue sola.
 *
 * Nunca SQL generado por el modelo, nunca escritura, y nunca aritmética del
 * modelo: los totales y porcentajes que devuelven estos procedures ya los
 * calculó `@erp/core`. Los `exportar` quedan afuera a propósito: dejan una
 * entrada de exportación en el historial.
 */

const crearCaller = createCallerFactory(appRouter);
type Caller = ReturnType<typeof crearCaller>;

/** Cuántas filas de un listado ve el modelo: más no aporta y cuesta tokens. */
const FILAS_MAXIMAS = 25;

/** Tope de caracteres de una respuesta de herramienta. */
const CARACTERES_MAXIMOS = 20_000;

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Fecha en formato AAAA-MM-DD");

/**
 * Lo que vuelve al modelo. Un listado paginado se recorta a las primeras
 * filas, avisando cuántas había: así no responde "tenés 25 clientes" cuando
 * tiene 300.
 */
/**
 * Campos internos que no le dicen nada al modelo y se pagan por carácter: el
 * tenant es siempre el mismo, y las fechas de creación no son las del negocio.
 */
const CAMPOS_INTERNOS = new Set(["tenantId", "createdAt", "updatedAt", "creado", "usuarioId"]);

function sinInternos(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(sinInternos);
  }
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([clave]) => !CAMPOS_INTERNOS.has(clave))
        .map(([clave, v]) => [clave, sinInternos(v)]),
    );
  }
  return valor;
}

export function recortar(valorCrudo: unknown): unknown {
  const valor = sinInternos(valorCrudo);
  let resultado = valor;
  if (Array.isArray(valor) && valor.length > FILAS_MAXIMAS) {
    resultado = {
      filas: valor.slice(0, FILAS_MAXIMAS),
      nota: `Se muestran ${FILAS_MAXIMAS} de ${valor.length} filas.`,
    };
  } else if (
    valor &&
    typeof valor === "object" &&
    "items" in valor &&
    Array.isArray((valor as { items: unknown }).items)
  ) {
    const { items, ...resto } = valor as { items: unknown[] };
    resultado = {
      ...resto,
      items: items.slice(0, FILAS_MAXIMAS),
      ...(items.length > FILAS_MAXIMAS
        ? { nota: `Se muestran ${FILAS_MAXIMAS} filas de esta página.` }
        : {}),
    };
  }
  const texto = JSON.stringify(resultado);
  if (texto.length > CARACTERES_MAXIMOS) {
    return {
      recortado: true,
      nota: "La respuesta era demasiado larga. Pedí algo más acotado (un filtro, un rango de fechas).",
      datos: texto.slice(0, CARACTERES_MAXIMOS),
    };
  }
  return resultado;
}

/**
 * Corre una consulta y traduce los errores a algo que el modelo pueda
 * contarle al usuario, sin filtrar detalles internos.
 */
export async function consultar(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return recortar(await fn());
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
        return { error: "Este usuario no tiene acceso a esa información." };
      }
      if (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST") {
        return { error: error.message };
      }
    }
    console.error("[asistente] Falló una herramienta:", error);
    return { error: "No se pudo consultar esa información. Que lo revise en la pantalla." };
  }
}

/** Página de un listado: 1 es la primera; cada página trae hasta 25 filas. */
const pagina = z.number().int().min(1).max(200).optional().describe("Página, desde 1");

/**
 * Las consultas de la app que usa el asistente. Un test compara esta lista con
 * todas las consultas de lectura del router: si aparece un módulo nuevo y
 * nadie decide si el asistente lo ve, el test falla.
 */
export const CONSULTAS_DEL_ASISTENTE = [
  "financiero.resumen",
  "cotizaciones.dolar",
  "parametros.obtener",
  "resultados.estado",
  "resultados.rentabilidad",
  "resultados.categorias.listar",
  "resultados.recurrentes.listar",
  "clientes.listar",
  "clientes.resumen",
  "cuentaCorriente.cliente",
  "cuentaCorriente.pendientesClientes",
  "proveedores.listar",
  "proveedores.resumen",
  "cuentaCorriente.proveedor",
  "cuentaCorriente.pendientesProveedores",
  "comprobantes.ventas.listar",
  "comprobantes.ventas.obtener",
  "comprobantes.ventas.totales",
  "comprobantes.compras.listar",
  "comprobantes.compras.obtener",
  "comprobantes.compras.totales",
  "stock.listar",
  "stock.movimientos",
  "stock.reposicion",
  "tesoreria.cuentas.listar",
  "tesoreria.movimientos.listar",
  "tesoreria.cheques.listar",
  "impuestos.listar",
  "impuestos.posicionIva",
  "impuestos.retenciones.listar",
  "auditoria.listar",
  "equipo.listar",
  "consolidado.listar",
] as const;

/** Las herramientas, atadas a la sesión de quien pregunta. */
export function herramientasDeDatos(contexto: Context): ToolSet {
  const caller: Caller = crearCaller(contexto);

  const herramientas: ToolSet = {
    // --- Panel y empresa ---
    panel_financiero: tool({
      description:
        "Indicadores del panel (liquidez, DSO, DPO, rotación, margen, concentración de cheques, impuestos vencidos), saldo de cada cuenta y consolidado en pesos, proyección de caja a 13 semanas con cobros y pagos por semana, alertas de caja, cobros y pagos vencidos, y ventas por mes.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.financiero.resumen()),
    }),

    cotizacion_dolar: tool({
      description: "Cotización del dólar oficial y blue: compra, venta y variación del día.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.cotizaciones.dolar()),
    }),

    parametros: tool({
      description:
        "Parámetros de la empresa: umbral de mora, margen objetivo, mínimo operativo, umbral de concentración, régimen fiscal y día de vencimiento del IVA.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.parametros.obtener()),
    }),

    // --- Resultados ---
    estado_de_resultados: tool({
      description:
        "Estado de resultados mensual: ventas netas, costo de ventas, margen bruto, gastos por categoría, IIBB, resultado operativo y neto. Termina en el mes en curso; con 13 o más meses sirve para comparar con el mismo mes del año anterior.",
      inputSchema: z.object({
        meses: z
          .number()
          .int()
          .min(1)
          .max(24)
          .describe("Cuántos meses hacia atrás, contando el actual"),
      }),
      execute: ({ meses }) => consultar(() => caller.resultados.estado({ meses })),
    }),

    rentabilidad: tool({
      description:
        "Ventas netas, costo, margen y margen % entre dos fechas, agrupado por cliente, por producto o por categoría de producto. Por producto también trae unidades vendidas, precio y costo unitario promedio. Se puede filtrar por un cliente (qué productos le compra) o por un producto (quién lo compra).",
      inputSchema: z.object({
        agrupar: z.enum(["cliente", "producto", "categoria"]),
        desde: fecha,
        hasta: fecha,
        clienteId: z.uuid().optional(),
        productoId: z.uuid().optional(),
      }),
      execute: (input) => consultar(() => caller.resultados.rentabilidad(input)),
    }),

    gastos_fijos_y_categorias: tool({
      description:
        "Los gastos recurrentes (importe, día del mes, categoría, cuenta, activos o no) y las categorías de ingresos y gastos de la empresa.",
      inputSchema: z.object({}),
      execute: () =>
        consultar(async () => ({
          gastosRecurrentes: await caller.resultados.recurrentes.listar(),
          categorias: await caller.resultados.categorias.listar(),
        })),
    }),

    // --- Clientes ---
    buscar_clientes: tool({
      description:
        "Clientes con CUIT, condición de IVA, contacto, límite de crédito, saldo a cobrar, próximo vencimiento, si está en mora y si pasó su límite. Usala también para conseguir el id de un cliente por su nombre.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte de la razón social o del CUIT"),
        soloEnMora: z.boolean().optional(),
        pagina,
      }),
      execute: ({ busqueda, soloEnMora, pagina }) =>
        consultar(() =>
          caller.clientes.listar({
            ...(busqueda ? { busqueda } : {}),
            ...(soloEnMora ? { estado: "en_mora" as const } : {}),
            ...(pagina ? { pagina } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    total_a_cobrar: tool({
      description: "Total a cobrar a clientes y el cliente que más concentra la deuda.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.clientes.resumen({})),
    }),

    pendientes_de_cobro: tool({
      description:
        "Facturas con saldo pendiente de TODOS los clientes, por vencimiento, con días de atraso; un ranking de quién debe más (pendiente y vencido por cliente) y los totales. Sirve para: qué tengo vencido, quién me debe más, qué cobro esta semana (venceHasta).",
      inputSchema: z.object({
        soloVencidos: z.boolean().optional(),
        venceHasta: fecha.optional().describe("Sólo lo que vence hasta esta fecha"),
      }),
      execute: ({ soloVencidos, venceHasta }) =>
        consultar(() =>
          caller.cuentaCorriente.pendientesClientes({
            soloVencidos: soloVencidos ?? false,
            ...(venceHasta ? { venceHasta } : {}),
          }),
        ),
    }),

    cuenta_corriente_cliente: tool({
      description:
        "Ficha de un cliente: saldo, a cuenta, antigüedad de la deuda, facturas pendientes, crédito usado, cheques y últimos movimientos. Necesita el id (buscalo con buscar_clientes).",
      inputSchema: z.object({ clienteId: z.uuid() }),
      execute: ({ clienteId }) =>
        consultar(() => caller.cuentaCorriente.cliente({ id: clienteId })),
    }),

    // --- Proveedores ---
    buscar_proveedores: tool({
      description:
        "Proveedores con CUIT, rubro, plazo de pago, CBU y alias, contacto, saldo a pagar y próximo vencimiento. Usala también para conseguir el id de un proveedor por su nombre.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte de la razón social o del CUIT"),
        pagina,
      }),
      execute: ({ busqueda, pagina }) =>
        consultar(() =>
          caller.proveedores.listar({
            ...(busqueda ? { busqueda } : {}),
            ...(pagina ? { pagina } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    total_a_pagar: tool({
      description: "Total a pagar a proveedores y el proveedor que más concentra la deuda.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.proveedores.resumen({})),
    }),

    pendientes_de_pago: tool({
      description:
        "Compras con saldo pendiente de TODOS los proveedores, por vencimiento, con días de atraso; un ranking de a quién se le debe más y los totales. Sirve para: qué tengo que pagar esta semana (venceHasta), qué pagos tengo vencidos.",
      inputSchema: z.object({
        soloVencidos: z.boolean().optional(),
        venceHasta: fecha.optional().describe("Sólo lo que vence hasta esta fecha"),
      }),
      execute: ({ soloVencidos, venceHasta }) =>
        consultar(() =>
          caller.cuentaCorriente.pendientesProveedores({
            soloVencidos: soloVencidos ?? false,
            ...(venceHasta ? { venceHasta } : {}),
          }),
        ),
    }),

    cuenta_corriente_proveedor: tool({
      description:
        "Ficha de un proveedor: saldo, a cuenta, antigüedad de la deuda, compras pendientes y últimos pagos. Necesita el id (buscalo con buscar_proveedores).",
      inputSchema: z.object({ proveedorId: z.uuid() }),
      execute: ({ proveedorId }) =>
        consultar(() => caller.cuentaCorriente.proveedor({ id: proveedorId })),
    }),

    // --- Comprobantes ---
    comprobantes_de_venta: tool({
      description:
        "Facturas, notas de crédito y de débito de venta, de la más nueva a la más vieja, con neto, IVA, total, estado y estado de cobro, y la cantidad total. Filtra por fechas de emisión, estado o cliente.",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        estado: z
          .enum(ESTADOS_COMPROBANTE)
          .optional()
          .describe("aprobada es la que la pantalla muestra como Confirmada"),
        clienteId: z.uuid().optional(),
        pagina,
      }),
      execute: (input) =>
        consultar(() =>
          caller.comprobantes.ventas.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    detalle_de_venta: tool({
      description:
        "Un comprobante de venta completo: cliente, fechas, ítems (producto, cantidad, precio, IVA), totales, CAE y lo cobrado. Necesita el id (de comprobantes_de_venta o pendientes_de_cobro).",
      inputSchema: z.object({ id: z.uuid() }),
      execute: ({ id }) => consultar(() => caller.comprobantes.ventas.obtener({ id })),
    }),

    totales_de_venta_por_cliente: tool({
      description:
        "Cuánto se le facturó a cada cliente entre dos fechas: cantidad de comprobantes, neto, IVA y total (notas de crédito restando), de mayor a menor.",
      inputSchema: z.object({ desde: fecha, hasta: fecha }),
      execute: (input) => consultar(() => caller.comprobantes.ventas.totales(input)),
    }),

    comprobantes_de_compra: tool({
      description:
        "Comprobantes de compra, del más nuevo al más viejo, con neto, IVA, total, categoría y estado de pago, y la cantidad total. Filtra por fechas de recepción o proveedor.",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        proveedorId: z.uuid().optional(),
        pagina,
      }),
      execute: (input) =>
        consultar(() =>
          caller.comprobantes.compras.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    detalle_de_compra: tool({
      description:
        "Un comprobante de compra completo: proveedor, fechas, concepto, ítems con producto, importes y lo pagado. Necesita el id (de comprobantes_de_compra o pendientes_de_pago).",
      inputSchema: z.object({ id: z.uuid() }),
      execute: ({ id }) => consultar(() => caller.comprobantes.compras.obtener({ id })),
    }),

    totales_de_compra_por_proveedor: tool({
      description:
        "Cuánto se le compró a cada proveedor entre dos fechas: cantidad de comprobantes, neto, IVA y total, de mayor a menor.",
      inputSchema: z.object({ desde: fecha, hasta: fecha }),
      execute: (input) => consultar(() => caller.comprobantes.compras.totales(input)),
    }),

    // --- Stock ---
    stock: tool({
      description:
        "Productos con SKU, categoría, proveedor, stock, mínimo, estado (Reponer u OK), costo, precio, margen y valorización, y el capital inmovilizado total.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte del SKU o la descripción"),
        soloReponer: z.boolean().optional(),
        pagina,
      }),
      execute: ({ busqueda, soloReponer, pagina }) =>
        consultar(() =>
          caller.stock.listar({
            ...(busqueda ? { busqueda } : {}),
            soloReponer: soloReponer ?? false,
            ...(pagina ? { pagina } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    movimientos_de_producto: tool({
      description:
        "La historia del stock de un producto: ventas, devoluciones, compras y ajustes con fecha, cantidad y costo. Necesita el id (buscalo con stock).",
      inputSchema: z.object({ productoId: z.uuid() }),
      execute: ({ productoId }) => consultar(() => caller.stock.movimientos({ productoId })),
    }),

    sugerencia_de_compra: tool({
      description:
        "Qué comprar de los productos para reponer, agrupado por proveedor, con cantidad, costo de reposición e importe.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.stock.reposicion()),
    }),

    // --- Tesorería ---
    cuentas_y_saldos: tool({
      description: "Cuentas de tesorería (caja, bancos, dólares) con su moneda y su saldo.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.tesoreria.cuentas.listar()),
    }),

    movimientos_de_tesoreria: tool({
      description:
        "Ingresos y egresos de tesorería, del más nuevo al más viejo, con fecha, cuenta, medio de pago, concepto, importe, contraparte y categoría. Filtra por fechas, tipo o cuenta (el id sale de cuentas_y_saldos).",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        tipo: z.enum(tiposMovimiento).optional(),
        cuentaId: z.uuid().optional(),
        pagina,
      }),
      execute: (input) =>
        consultar(() =>
          caller.tesoreria.movimientos.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    cheques: tool({
      description:
        "Cheques recibidos con librador, banco, fecha de pago, importe y estado. Filtra por estado y por fecha de pago (qué cheques cobro esta semana).",
      inputSchema: z.object({
        estado: z
          .enum(["en_cartera", "depositado", "acreditado", "rechazado", "endosado"])
          .optional(),
        desde: fecha.optional().describe("Fecha de pago desde"),
        hasta: fecha.optional().describe("Fecha de pago hasta"),
        pagina,
      }),
      execute: (input) =>
        consultar(() => caller.tesoreria.cheques.listar({ ...input, tamanoPagina: FILAS_MAXIMAS })),
    }),

    // --- Impuestos ---
    impuestos: tool({
      description:
        "Obligaciones impositivas (IVA, IIBB, Ganancias, Monotributo, otros) con período, determinado, pagado, saldo, vencimiento y estado, y el total adeudado. Filtra por tipo, impagas y fechas de vencimiento (qué vence este mes).",
      inputSchema: z.object({
        tipo: z.enum(tiposImpuesto).optional(),
        soloImpagos: z.boolean().optional(),
        venceDesde: fecha.optional(),
        venceHasta: fecha.optional(),
        pagina,
      }),
      execute: ({ tipo, soloImpagos, venceDesde, venceHasta, pagina }) =>
        consultar(() =>
          caller.impuestos.listar({
            ...(tipo ? { tipo } : {}),
            soloImpagos: soloImpagos ?? false,
            campoFecha: "fechaVencimiento",
            ...(venceDesde ? { desde: venceDesde } : {}),
            ...(venceHasta ? { hasta: venceHasta } : {}),
            ...(pagina ? { pagina } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    posicion_de_iva: tool({
      description:
        "Posición de IVA por mes: débito fiscal, crédito fiscal, saldo a favor anterior, a pagar y saldo a favor.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.impuestos.posicionIva()),
    }),

    retenciones_iibb: tool({
      description:
        "Retenciones, percepciones y SIRCREB de Ingresos Brutos, con período, fecha, agente, comprobante e importe.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.impuestos.retenciones.listar()),
    }),

    // --- Administración: sólo administradores. Para el resto la consulta
    // devuelve "sin acceso", igual que la pantalla. ---
    historial: tool({
      description:
        "Historial de cambios: quién dio de alta, modificó, borró o exportó qué y cuándo. Filtra por módulo y fechas. Sólo para administradores.",
      inputSchema: z.object({
        modulo: z
          .enum(Object.keys(MODULOS_AUDITABLES) as [ModuloAuditable, ...ModuloAuditable[]])
          .optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        pagina,
      }),
      execute: ({ modulo, desde, hasta, pagina }) =>
        consultar(() =>
          caller.auditoria.listar({
            ...(modulo ? { modulo } : {}),
            ...(desde ? { desde } : {}),
            ...(hasta ? { hasta } : {}),
            pagina: pagina ?? 1,
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    equipo_y_accesos: tool({
      description:
        "Quiénes usan el sistema (nombre, mail, rol, si ve el panel), las invitaciones pendientes y los links de solo lectura activos. Sólo para administradores.",
      inputSchema: z.object({}),
      execute: () =>
        consultar(async () => ({
          equipo: await caller.equipo.listar(),
          linksDeSoloLectura: await caller.consolidado.listar(),
        })),
    }),
  };

  // Sin modo estricto: en estricto OpenAI exige que todo campo sea
  // obligatorio, y estos filtros son opcionales. El input igual se valida dos
  // veces: con el esquema de la herramienta y con el Zod del procedure.
  for (const h of Object.values(herramientas)) {
    h.strict = false;
  }
  return herramientas;
}
