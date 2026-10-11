# Proveedores

Listado en `/proveedores`.

## Crear un proveedor

1. Entrá a **Proveedores** en el menú.
2. Apretá **Nuevo proveedor** (ruta directa: `/proveedores/nuevo`).
3. Completá el formulario y guardá.

### Campos

| Campo | Obligatorio | Notas |
|---|---|---|
| Razón social | Sí | Hasta 200 caracteres |
| CUIT | No | 11 dígitos con verificador válido |
| Condición IVA | Sí | |
| Rubro | No | Texto libre |
| Plazo de pago (días) | Sí | Entre 0 y 365. Default 0 |
| CBU | No | Exactamente 22 dígitos |
| Alias CBU | No | |
| Email | No | |
| Teléfono | No | |

## Editar

Clic en la razón social del listado → `/proveedores/{id}`.

## Columnas del listado

- **Plazo**: los días de pago pactados que cargaste.
- **Saldo a pagar**: lo que le debés, calculado sobre los comprobantes de
  compra registrados.
- **Próx. vencimiento**: es un dato **calculado**, no se carga a mano. Sale de
  tomar la fecha de recepción de cada compra registrada a ese proveedor,
  sumarle el plazo de pago, y quedarse con la fecha más próxima que todavía no
  pasó. Si el proveedor no tiene compras pendientes, aparece vacío.

## Plazo de pago

Es la base de la proyección de egresos del panel: el sistema asume que una
compra recibida hoy se paga dentro de esa cantidad de días.

## Total a pagar y concentración

Arriba del listado hay dos tarjetas:

- **Total a pagar**: la suma de los saldos pendientes de todos los proveedores
  que matchean los filtros activos — no de la página que estás viendo.
- **Mayor concentración**: qué porcentaje del total se lleva el proveedor más
  grande, y cuál es.

Acá la concentración mide un riesgo distinto al de clientes. No es que no te
paguen: es **dependencia**. Si el proveedor que concentra la mitad de tus
compras aumenta, te cambia las condiciones o cierra, no tenés de dónde comprar.

Cuando supera el umbral de la empresa, la tarjeta pasa a **Atención** y el
porcentaje de esa fila se marca. El umbral se configura en Parámetros y es el
mismo que usa la pantalla de Clientes.

Los importes son **solo en pesos**. Si hay compras en otra moneda aparece un
aviso debajo de las tarjetas: no se suman monedas distintas.

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
