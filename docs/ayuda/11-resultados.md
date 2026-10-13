# Resultados

Pantalla en `/resultados`. Dice si la empresa gana plata y dónde: el panel
muestra la caja; esta pantalla, la rentabilidad.

## Estado de resultados

Una tabla con un mes por columna (3, 6 o 12 meses) y estos renglones:

| Renglón | De dónde sale |
|---|---|
| Ventas netas | El neto (sin IVA) de las facturas Enviadas o Confirmadas, por fecha de emisión. Las notas de crédito restan |
| Costo de ventas | El costo de los productos vendidos. Un ítem de texto libre no tiene costo |
| Margen bruto | Ventas netas − costo de ventas, y su porcentaje |
| Gastos | Por categoría (ver abajo) |
| Impuestos sobre ventas (IIBB) | El IIBB del período, antes de retenciones. El IVA no es gasto |
| Resultado operativo | Margen bruto − gastos − IIBB |
| Otros ingresos | Movimientos con categoría de ingreso (intereses, por ejemplo) |
| Resultado neto | Antes del impuesto a las ganancias |

Es **devengado**: cada cosa cuenta en el mes de su comprobante, no en el que se
cobró o se pagó. Todo en pesos.

### Qué es un gasto

Para que **cada peso cuente una sola vez**:

- **Es gasto** una compra con categoría de gasto (un flete, un honorario), por
  su neto, en el mes de recepción.
- **Es gasto** un movimiento de Tesorería **sin cliente ni proveedor** con
  categoría de gasto (sueldos, alquiler, comisiones bancarias).
- **No es gasto** una compra de **mercadería para stock**: cuenta como costo
  cuando se vende el producto.
- **No es gasto** un pago a un proveedor: cancela una compra que ya se contó.

## Rentabilidad

Ventas netas, costo y margen **por cliente**, **por producto** o **por
categoría de producto**, en el período que elijas (este mes, 3 o 12 meses).
Arriba lo que más deja, abajo las fugas.

Si una fila dice **costo incompleto**, tiene ítems facturados sin producto del
stock: su costo no se conoce y el margen aparece más alto de lo que es.

## Gastos recurrentes

Sueldos, alquiler: lo que se paga todos los meses sin comprobante. Se cargan
con descripción, categoría, cuenta, importe, día del mes y desde cuándo.

**Sólo se proyectan**: aparecen como pago en la proyección de caja del panel,
pero no crean movimientos. El pago real se sigue registrando en Tesorería, con
su categoría. Se pueden pausar destildando **Activo**.

## Categorías

La lista de categorías de ingresos y gastos de la empresa. Arranca con una lista
inicial (sueldos y cargas sociales, alquiler, servicios, fletes, honorarios,
comisiones bancarias, impuestos y tasas, otros gastos, intereses ganados y
otros ingresos) y se puede agregar, renombrar o desactivar. Una categoría no se
borra: se desactiva, porque la usan movimientos viejos.
