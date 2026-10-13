import { ESTADOS_COMPROBANTE } from "@erp/core/invoicing";
import { TRPCError } from "@trpc/server";
import { type ToolSet, tool } from "ai";
import { z } from "zod";
import type { Context } from "../../trpc/context.js";
import { appRouter } from "../../trpc/router.js";
import { createCallerFactory } from "../../trpc/trpc.js";
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
export function recortar(valor: unknown): unknown {
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

/** Las herramientas, atadas a la sesión de quien pregunta. */
export function herramientasDeDatos(contexto: Context): ToolSet {
  const caller: Caller = crearCaller(contexto);

  const herramientas: ToolSet = {
    panel_financiero: tool({
      description:
        "Indicadores del panel (liquidez, DSO, DPO, rotación, margen, concentración de cheques, impuestos vencidos), saldo de cada cuenta, proyección de caja a 13 semanas, alertas de caja y cobros/pagos vencidos.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.financiero.resumen()),
    }),

    estado_de_resultados: tool({
      description:
        "Estado de resultados mensual: ventas netas, costo de ventas, margen bruto, gastos por categoría, IIBB, resultado operativo y neto. Termina en el mes en curso.",
      inputSchema: z.object({
        meses: z
          .number()
          .int()
          .min(1)
          .max(12)
          .describe("Cuántos meses hacia atrás, contando el actual"),
      }),
      execute: ({ meses }) => consultar(() => caller.resultados.estado({ meses })),
    }),

    rentabilidad: tool({
      description:
        "Ventas netas, costo, margen y margen % entre dos fechas, agrupado por cliente, por producto o por categoría de producto. Por producto también trae unidades, precio y costo unitario promedio. Sirve para '¿cuánto le vendí a X?' o '¿qué producto deja más?'.",
      inputSchema: z.object({
        agrupar: z.enum(["cliente", "producto", "categoria"]),
        desde: fecha,
        hasta: fecha,
      }),
      execute: (input) => consultar(() => caller.resultados.rentabilidad(input)),
    }),

    buscar_clientes: tool({
      description:
        "Clientes con su saldo a cobrar, próximo vencimiento, si está en mora y si pasó su límite de crédito. Usala también para conseguir el id de un cliente por su nombre.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte de la razón social o del CUIT"),
        soloEnMora: z.boolean().optional(),
      }),
      execute: ({ busqueda, soloEnMora }) =>
        consultar(() =>
          caller.clientes.listar({
            ...(busqueda ? { busqueda } : {}),
            ...(soloEnMora ? { estado: "en_mora" as const } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    total_a_cobrar: tool({
      description: "Total a cobrar a clientes y el cliente que más concentra la deuda.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.clientes.resumen({})),
    }),

    cuenta_corriente_cliente: tool({
      description:
        "Ficha de un cliente: saldo, a cuenta, antigüedad de la deuda, facturas pendientes, cheques y últimos movimientos. Necesita el id (buscalo con buscar_clientes).",
      inputSchema: z.object({ clienteId: z.uuid() }),
      execute: ({ clienteId }) =>
        consultar(() => caller.cuentaCorriente.cliente({ id: clienteId })),
    }),

    buscar_proveedores: tool({
      description:
        "Proveedores con su saldo a pagar y próximo vencimiento. Usala también para conseguir el id de un proveedor por su nombre.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte de la razón social o del CUIT"),
      }),
      execute: ({ busqueda }) =>
        consultar(() =>
          caller.proveedores.listar({
            ...(busqueda ? { busqueda } : {}),
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    total_a_pagar: tool({
      description: "Total a pagar a proveedores y el proveedor que más concentra la deuda.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.proveedores.resumen({})),
    }),

    cuenta_corriente_proveedor: tool({
      description:
        "Ficha de un proveedor: saldo, a cuenta, antigüedad de la deuda, compras pendientes y últimos pagos. Necesita el id (buscalo con buscar_proveedores).",
      inputSchema: z.object({ proveedorId: z.uuid() }),
      execute: ({ proveedorId }) =>
        consultar(() => caller.cuentaCorriente.proveedor({ id: proveedorId })),
    }),

    comprobantes_de_venta: tool({
      description:
        "Facturas, notas de crédito y de débito de venta, con neto, IVA, total, estado y estado de cobro. Filtra por fechas de emisión, estado o cliente.",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        estado: z
          .enum(ESTADOS_COMPROBANTE)
          .optional()
          .describe("aprobada es la que la pantalla muestra como Confirmada"),
        clienteId: z.uuid().optional(),
      }),
      execute: (input) =>
        consultar(() =>
          caller.comprobantes.ventas.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    comprobantes_de_compra: tool({
      description:
        "Comprobantes de compra con neto, IVA, total y estado de pago. Filtra por fechas de recepción o proveedor.",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        proveedorId: z.uuid().optional(),
      }),
      execute: (input) =>
        consultar(() =>
          caller.comprobantes.compras.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    stock: tool({
      description:
        "Productos con stock, mínimo, estado (Reponer u OK), costo, precio, margen y valorización.",
      inputSchema: z.object({
        busqueda: z.string().max(100).optional().describe("Parte del SKU o la descripción"),
        soloReponer: z.boolean().optional(),
      }),
      execute: ({ busqueda, soloReponer }) =>
        consultar(() =>
          caller.stock.listar({
            ...(busqueda ? { busqueda } : {}),
            soloReponer: soloReponer ?? false,
            tamanoPagina: FILAS_MAXIMAS,
          }),
        ),
    }),

    sugerencia_de_compra: tool({
      description:
        "Qué comprar de los productos para reponer, agrupado por proveedor, con cantidad, costo de reposición e importe.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.stock.reposicion()),
    }),

    cuentas_y_saldos: tool({
      description: "Cuentas de tesorería (caja, bancos) con su saldo.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.tesoreria.cuentas.listar()),
    }),

    movimientos_de_tesoreria: tool({
      description:
        "Ingresos y egresos de tesorería con fecha, cuenta, concepto, importe, contraparte y categoría.",
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        tipo: z.enum(tiposMovimiento).optional(),
      }),
      execute: (input) =>
        consultar(() =>
          caller.tesoreria.movimientos.listar({ ...input, tamanoPagina: FILAS_MAXIMAS }),
        ),
    }),

    cheques: tool({
      description: "Cheques recibidos con librador, banco, fecha de pago, importe y estado.",
      inputSchema: z.object({
        estado: z
          .enum(["en_cartera", "depositado", "acreditado", "rechazado", "endosado"])
          .optional(),
      }),
      execute: (input) =>
        consultar(() => caller.tesoreria.cheques.listar({ ...input, tamanoPagina: FILAS_MAXIMAS })),
    }),

    impuestos: tool({
      description:
        "Obligaciones impositivas (IVA, IIBB, Ganancias, Monotributo, otros) con período, determinado, saldo, vencimiento y estado.",
      inputSchema: z.object({
        tipo: z.enum(tiposImpuesto).optional(),
        soloImpagos: z.boolean().optional(),
      }),
      execute: ({ tipo, soloImpagos }) =>
        consultar(() =>
          caller.impuestos.listar({
            ...(tipo ? { tipo } : {}),
            soloImpagos: soloImpagos ?? false,
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

    parametros: tool({
      description:
        "Parámetros de la empresa: umbral de mora, margen objetivo, mínimo operativo, umbral de concentración y régimen fiscal.",
      inputSchema: z.object({}),
      execute: () => consultar(() => caller.parametros.obtener()),
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
