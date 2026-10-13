# Comprobantes

Pantalla en `/comprobantes`. Tiene dos partes: **comprobantes de venta** y
**comprobantes de compra**, que son tablas separadas.

## Crear un comprobante de venta

1. Entrá a **Comprobantes** en el menú.
2. Apretá **Nuevo comprobante** (ruta directa: `/comprobantes/nuevo`).
3. Elegí el cliente, la fecha y cargá los ítems.
4. Guardá.

### Cabecera

| Campo | Obligatorio | Notas |
|---|---|---|
| Clase | Sí | Factura, Nota de crédito o Nota de débito |
| Punto de venta | Sí | Entre 1 y 99999 |
| Número | No | Carga manual en esta fase |
| Cliente | Sí | De la lista de clientes |
| Fecha de emisión | Sí | |
| Condición de venta (días) | Sí | 0 a 365. Default 0 (contado) |
| Moneda | Sí | ARS o USD |

### Ítems

Hace falta **al menos un ítem**. Cada uno lleva:

- Producto (opcional): se elige de la lista del stock. Al elegirlo se completan
  solos la descripción y el precio, que se pueden cambiar. Si el ítem no es un
  producto del stock, se deja en "Sin producto (texto libre)".
- Descripción (obligatoria)
- Cantidad (mayor a cero, hasta 3 decimales)
- Precio unitario
- Alícuota de IVA: 0, 2.5, 5, 10.5, 21, 27, exento o no gravado

El neto, el IVA y el total los calcula el sistema agrupando por alícuota.

Elegir el producto importa: es lo que permite calcular el **margen bruto** del
panel. Un ítem de texto libre no tiene costo, así que no entra en el margen ni
en la rotación de stock.

## Letra del comprobante

La letra la determina el sistema según la condición IVA del emisor y la del
cliente:

- Emisor Responsable Inscripto → cliente Responsable Inscripto: **A**
- Emisor Responsable Inscripto → cualquier otro cliente: **B**
- Emisor Monotributo o Exento: siempre **C**

Solo la letra A discrimina IVA. En B y C el IVA va incluido en el total.

## Estados y ciclo de vida

Un comprobante pasa por estos estados:

```
borrador  --emitir-->  enviada  --confirmar-->  confirmada
                          |
                          --rechazar--> rechazada --corregir--> borrador
```

- **Borrador**: es el único estado editable.
- **Enviada**: ya salió, esperando respuesta.
- **Confirmada**: estado final. **No se puede editar ni anular.** Una vez
  confirmado, un comprobante se corrige únicamente emitiendo una nota de
  crédito o de débito.

"Confirmada" no quiere decir que ARCA lo haya autorizado: el sistema todavía no
emite factura electrónica, así que ningún comprobante tiene CAE. Cuando exista
la emisión, el estado final va a ser el autorizado por ARCA.
- **Rechazada**: se puede volver a borrador con la acción "Corregir".

Los botones de acción que aparecen en la pantalla dependen del estado: si no
ves "Editar", es porque el comprobante ya no está en borrador.

## Registrar el cobro desde la factura

El detalle de una factura dice su estado de cobro, cuánto queda pendiente y
cuándo vence. Si queda algo, el botón **Registrar cobro** registra el ingreso
en Tesorería ya **imputado a esa factura**: se elige la cuenta, el medio
(transferencia o efectivo) y el importe, que viene con lo pendiente. Si se
cobra menos, la factura queda parcial. Un cobro con cheque se carga desde
Tesorería, porque hay que elegir el cheque.

## Compras: mercadería o gasto

Al cargar una compra, el campo **Qué es** dice cómo entra en el estado de
resultados:

- **Mercadería para stock** (el valor por defecto): no es gasto del mes; cuenta
  como costo cuando se vende el producto.
- **Una categoría de gasto** (fletes, honorarios, servicios): es gasto del mes
  de recepción, por su neto.

## Estado de cobro

La lista de ventas tiene una columna **Cobro**, y la de compras una de **Pago**:

| Estado | Qué significa |
|---|---|
| Pendiente | No se cobró nada y todavía no venció |
| Parcial | Se cobró una parte; dice cuánto resta |
| Vencida | Venció y queda algo por cobrar |
| Cobrada / Pagada | No queda nada |

El vencimiento es la fecha de emisión (o de recepción, en compras) más los días
de la condición de venta o de pago. Lo cobrado sale de los movimientos de
Tesorería: lo imputado a cada factura y, lo que no se imputó, aplicado a las
más viejas primero. Un borrador, un rechazado o una nota de crédito no son
deuda y muestran una raya.

## Facturación electrónica

En esta fase la carga es **manual**: no hay conexión con ARCA ni se pide CAE.
El número de comprobante se escribe a mano. La emisión electrónica llega en una
etapa posterior sobre este mismo esquema.

## Comprobantes de compra

Se registran en una tabla propia, separada de las ventas. Llevan el proveedor,
la fecha de recepción y el importe. La fecha de recepción, más el plazo de pago
del proveedor, es lo que alimenta el próximo vencimiento y la proyección de
egresos.

## Filtros

- Por estado
- Por cliente
- Por rango de fechas (aplica sobre la fecha de emisión)

## Si la tabla no te entra en la pantalla

Arriba a la derecha de la tabla hay dos botones que cambian la **densidad**:

- **Cómoda**: como viene por defecto.
- **Compacta**: menos aire entre columnas y filas, y los títulos de columna se
  parten en dos líneas. Entran más columnas sin scrollear al costado y se ven
  más filas de una.

El tamaño de la letra **no cambia** en ninguno de los dos: lo único que se achica
es el espacio alrededor. Por eso conviene esto antes que bajar el zoom del
navegador, que sí achica el texto y los botones.

La elección se guarda en tu navegador y es **tuya**: cada persona tiene la suya,
y es independiente en cada pantalla.
