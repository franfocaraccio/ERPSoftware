import { type AnyColumn, and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { comprobantesVenta } from "../../db/schema/facturacion.js";

/**
 * Estados de comprobante que son deuda real.
 *
 * Un borrador todavía no se le reclamó a nadie y un rechazado ya no se
 * reclama. Proveedores no necesita este filtro porque las compras no tienen
 * máquina de estados.
 */
export const ESTADOS_QUE_DEBEN = ["enviada", "aprobada"] as const;

/**
 * Las ventas que cuentan para un total en pesos: deuda real y en ARS.
 *
 * Clientes y el panel tienen que contar lo mismo. Cuando cada uno filtraba a
 * su manera, el panel sumaba borradores y dólares y las dos pantallas daban
 * totales distintos para la misma empresa.
 */
export function ventasQueCuentan(): SQL | undefined {
  return and(
    inArray(comprobantesVenta.estado, [...ESTADOS_QUE_DEBEN]),
    eq(comprobantesVenta.moneda, "ARS"),
  );
}

/**
 * El total de un comprobante de venta con el signo que le corresponde a su
 * clase: la nota de crédito resta, la factura y la nota de débito suman.
 *
 * Por qué existe esta función en vez de escribir el `case` en cada consulta:
 * la nota de crédito es el **único** mecanismo para corregir un comprobante
 * con CAE, así que si suma, devolverle plata a un cliente le aumenta las
 * ventas. Eso estuvo mal durante un tiempo en el panel financiero mientras ya
 * estaba bien en clientes, precisamente porque el `case` estaba copiado a mano
 * en un solo lado. Un lugar, una regla.
 *
 * La nota de débito suma como una factura: agrega deuda, no la cancela.
 *
 * Invertir el signo de una fila según su clase es parte de la agregación, no
 * una fórmula financiera, así que vive en SQL y no en `@erp/core`. Lo que sí
 * vive en `core` es toda cuenta que se haga después con estos totales.
 */
export function totalConSigno(): SQL<string> {
  return conSigno(comprobantesVenta.total);
}

/**
 * Cualquier columna o expresión con el signo de la clase del comprobante. El
 * neto para ventas y margen; la cantidad y el costo de los ítems para las
 * salidas de stock, donde una nota de crédito es una devolución.
 */
export function conSigno(valor: AnyColumn | SQL): SQL<string> {
  return sql`case
    when ${comprobantesVenta.clase} = 'nota_credito'
      then -(${valor})
    else ${valor}
  end`;
}
