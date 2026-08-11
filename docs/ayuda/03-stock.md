# Stock

Listado en `/stock`.

## Crear un producto

1. Entrá a **Stock** en el menú.
2. Apretá **Nuevo producto** (ruta directa: `/stock/nuevo`).
3. Completá y guardá.

### Campos

| Campo | Obligatorio | Notas |
|---|---|---|
| SKU | Sí | Código interno, hasta 50 caracteres |
| Descripción | Sí | Hasta 300 caracteres |
| Categoría | No | Texto libre |
| Costo unitario | No | Carga manual |
| Precio de venta | No | |
| Moneda | Sí | ARS o USD. Default ARS |
| Stock actual | Sí | Default 0. Hasta 3 decimales |
| Stock mínimo | Sí | Default 0. Umbral de reposición |
| Proveedor principal | No | Se elige de la lista de proveedores |

## Editar

Clic en la descripción del listado → `/stock/{id}`.

## El stock se edita a mano

No hay tabla de movimientos de stock: **el stock actual es un número que se
edita directamente** en la ficha del producto. Cargar un comprobante de venta
no descuenta stock automáticamente.

Lo mismo con el costo unitario: es carga manual, no se calcula por última
compra ni por promedio ponderado.

## Filtros

- **Buscador**: por SKU o descripción.
- **Solo a reponer**: muestra únicamente los productos cuyo stock actual está
  por debajo del stock mínimo.
- **Categoría** y **Proveedor**.

## Columnas calculadas

- **Margen bruto**: diferencia entre precio de venta y costo unitario, en
  porcentaje. Necesita ambos cargados.
- **Valorización**: stock actual × costo unitario.
- **Estado**: marca los productos por debajo del mínimo.
