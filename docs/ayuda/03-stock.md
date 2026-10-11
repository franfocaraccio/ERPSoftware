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

## Si la tabla no te entra en la pantalla

Arriba a la derecha de la tabla hay dos botones que cambian la **densidad**:

- **Cómoda**: como viene por defecto.
- **Compacta**: menos aire entre columnas y filas. Entran todas las columnas sin
  tener que scrollear al costado, y se ven más productos de una.

El tamaño de la letra **no cambia** en ninguno de los dos: lo único que se achica
es el espacio alrededor. Por eso conviene esto antes que bajar el zoom del
navegador, que sí achica el texto y los botones.

La elección se guarda en tu navegador y es **tuya**: cada persona tiene la suya,
y es independiente en cada pantalla.

Las descripciones largas se cortan con puntos suspensivos para no empujar al
resto de las columnas. Pasando el mouse por encima se ve el texto completo.
