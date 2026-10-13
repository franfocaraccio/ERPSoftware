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

- Producto (opcional, se puede elegir del stock o escribir la descripción libre)
- Descripción (obligatoria)
- Cantidad (mayor a cero, hasta 3 decimales)
- Precio unitario
- Alícuota de IVA: 0, 2.5, 5, 10.5, 21, 27, exento o no gravado

El neto, el IVA y el total los calcula el sistema agrupando por alícuota.

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
borrador  --emitir-->  enviada  --aprobar-->  aprobada
                          |
                          --rechazar--> rechazada --corregir--> borrador
```

- **Borrador**: es el único estado editable.
- **Enviada**: ya salió, esperando respuesta.
- **Aprobada**: estado final. **No se puede editar ni anular.** Una vez
  aprobado, un comprobante se corrige únicamente emitiendo una nota de crédito
  o de débito.
- **Rechazada**: se puede volver a borrador con la acción "Corregir".

Los botones de acción que aparecen en la pantalla dependen del estado: si no
ves "Editar", es porque el comprobante ya no está en borrador.

## Facturación electrónica

En esta fase la carga es **manual**: no hay conexión con ARCA ni se pide CAE.
El número de comprobante se escribe a mano. La emisión electrónica llega en una
etapa posterior sobre este mismo esquema.

## Comprobantes de compra

Se registran en una tabla propia, separada de las ventas. Llevan el proveedor,
la fecha de recepción y el importe. La fecha de recepción, más el plazo de pago
del proveedor, es lo que alimenta el próximo vencimiento y la proyección de
egresos.

### Leer una factura de un archivo

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
