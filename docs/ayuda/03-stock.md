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
| Costo unitario | No | Se carga al crear; después lo recalcula cada compra (ver abajo) |
| Precio de venta | No | |
| Moneda | Sí | ARS o USD. Default ARS |
| Stock inicial | Sí | Con cuánto arranca. Default 0. Hasta 3 decimales |
| Stock mínimo | Sí | Default 0. Umbral de reposición |
| Proveedor principal | No | Se elige de la lista de proveedores |

## Editar

Clic en la descripción del listado → `/stock/{id}`.

## El stock se mueve solo

El stock **no se edita a mano**: cambia con cada movimiento, y en la ficha del
producto (`/stock/{id}`) está la lista de **Movimientos de stock**:

| Movimiento | Cuándo |
|---|---|
| Stock inicial | Al crear el producto, con lo que se cargó |
| Venta | Cuando una factura pasa a **Confirmada**: descuenta lo vendido |
| Devolución | Cuando una nota de crédito pasa a **Confirmada**: vuelve a entrar |
| Compra | Al cargar una compra de mercadería **con sus productos** |
| Ajuste | A mano, con un motivo (un conteo, una rotura) |

Una factura en borrador o enviada todavía no mueve stock. Un ítem de texto libre
(sin producto) tampoco.

Para corregir el stock se carga un **ajuste** desde la ficha: la cantidad, en
negativo para restar, y el motivo. Queda en el historial.

## El costo es promedio ponderado

Cada compra con productos recalcula el costo unitario:

(stock que había × costo que había + cantidad comprada × costo de compra) ÷
(stock total)

Si no había stock, el costo pasa a ser el de la compra. El costo de compra va
**sin IVA**. Cada venta guarda el costo que tenía el producto en ese momento.

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

Arriba a la derecha de la tabla hay dos controles.

**Elegir columnas** (el ícono de columnas): tildás las que querés ver y
destildás las que no te interesan. El número al lado del ícono te avisa cuántas
tenés escondidas, para que no te olvides de que la tabla tiene más datos de los
que estás viendo. La columna que identifica la fila no se puede esconder: sin
ella la tabla no diría de qué está hablando.

**Densidad**, con dos opciones:

- **Cómoda**: como viene por defecto.
- **Compacta**: menos aire entre columnas y filas, y los títulos de columna se
  parten en dos líneas. Entran más columnas sin scrollear al costado y se ven
  más filas de una.

El tamaño de la letra **no cambia** en ninguno de los dos: lo único que se achica
es el espacio alrededor. Por eso conviene esto antes que bajar el zoom del
navegador, que sí achica el texto y los botones.

Las dos elecciones se guardan en tu navegador y son **tuyas**: cada persona
tiene las suyas, y son independientes en cada pantalla.
