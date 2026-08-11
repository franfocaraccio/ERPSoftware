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

## Filtros

- Por estado
- Por cliente
- Por rango de fechas (aplica sobre la fecha de emisión)
