import { type SQL, sql } from "drizzle-orm";
import { comprobantesVenta } from "../../db/schema/facturacion.js";

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
  return sql`case
    when ${comprobantesVenta.clase} = 'nota_credito'
      then -${comprobantesVenta.total}
    else ${comprobantesVenta.total}
  end`;
}
