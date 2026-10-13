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
  crédito o de débito. Al confirmarse, una factura descuenta del stock lo
  vendido y una nota de crédito lo devuelve.
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

Una compra de mercadería puede llevar sus **productos** (opcional): producto,
cantidad y costo unitario sin IVA. Al guardarla suma al stock y recalcula el
costo de cada producto por promedio ponderado (ver `/stock`). Los productos de
una compra no se editan después: se corrige con un ajuste de stock.

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

### Leer una factura de venta de un archivo

Mientras no haya integración con ARCA, la factura se emite en el sitio de ARCA
y se carga acá. Para no tipearla dos veces, en **Nuevo comprobante** hay un
botón **Leer de un archivo**: subís el PDF que te dio ARCA (o una foto) y el
formulario se completa solo, incluidos el **CAE** y su vencimiento.

Sirve igual para cargar facturas viejas al historial.

Lo que conviene saber:

- **El total no se toma del papel: se calcula de los ítems**, con la misma
  cuenta que usa el sistema al guardar. El total impreso queda a la vista al
  lado para comparar: si no coinciden, algún ítem se leyó mal.
- **El producto del catálogo no se vincula solo.** Vincularlo es lo que hace
  que, al confirmar la factura, se descuente stock. Por eso lo decidís vos: una
  factura vieja se carga sin tocar la mercadería, y una de hoy con el producto
  puesto sí la mueve.
- **La letra la decide el sistema**, por tu régimen fiscal y la condición del
  cliente. La del papel se usa para entender el comprobante, no se copia.
- En una factura **C** no hay IVA, así que la alícuota queda en cero y el total
  cierra solo. En una **B** el IVA va adentro del precio y el papel no dice a
  qué tasa: ahí hay que revisar la alícuota y el precio a mano.

### Leer una factura de compra de un archivo

En la pestaña **Compras** hay un botón **Leer de un archivo**. Subís la factura
del proveedor —un PDF o una foto, hasta 10 MB— y el sistema la lee y **completa
el formulario** con lo que entendió: proveedor, letra, número, fechas, concepto
e importes.

Tres cosas que conviene saber:

- **No guarda nada solo.** Siempre queda un formulario que una persona revisa,
  corrige y recién ahí guarda. Esto es a propósito: un dato mal leído se
  arregla tipeando encima, pero un comprobante mal cargado ya es un número en
  el panel.
- **El archivo no se guarda.** Se lee y se descarta. De la factura queda el
  nombre y una huella del archivo en el historial, para poder reconocer después
  de cuál salió cada carga. Si querés conservar el PDF, guardalo vos.
- **Lo que no se entendió queda vacío y marcado**, nunca relleno con un valor
  inventado. Arriba del formulario aparece cuántos datos hay para revisar, y
  cada campo con problema lo explica abajo.

Si el emisor todavía no está cargado como proveedor, el aviso te lo dice con su
razón social y su CUIT: hay que crearlo antes de poder guardar la compra.

Sobre el IVA: en una factura **B o C** el IVA va incluido en el precio y el
campo queda en cero, aunque el papel muestre un "IVA contenido" por el régimen
de transparencia fiscal. Ese número ya está adentro del total. Sólo la factura
**A** lo lleva discriminado.

Hay un tope de lecturas por empresa y por día, porque cada lectura tiene un
costo. Cuando se agota, el aviso lo dice y se renueva al día siguiente.

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
