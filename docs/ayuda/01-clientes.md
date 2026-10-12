# Clientes

Listado en `/clientes`.

## Crear un cliente

1. Entrá a **Clientes** en el menú.
2. Apretá **Nuevo cliente** arriba a la derecha (ruta directa: `/clientes/nuevo`).
3. Completá el formulario.
4. Apretá **Guardar**.

### Campos

| Campo | Obligatorio | Notas |
|---|---|---|
| Razón social | Sí | Hasta 200 caracteres |
| CUIT | No | 11 dígitos; se valida el dígito verificador |
| Condición IVA | Sí | Resp. inscripto, Monotributo, Exento o Consumidor final |
| Email | No | |
| Teléfono | No | |
| Dirección | No | |
| Límite de crédito | No | Importe con punto decimal |

Si el CUIT da error aunque tenga 11 dígitos, el número no es válido: el último
dígito es un verificador calculado a partir de los otros diez.

## Editar un cliente

Clic en la razón social en el listado. Se abre `/clientes/{id}`.

Al editar aparece además el campo **Estado**: Activo, Inactivo o En mora. Al
crear no aparece — un cliente nuevo nace activo.

## Buscar y filtrar

- **Buscador**: busca por razón social o CUIT.
- **Condición IVA**: filtra por categoría fiscal.
- **Estado**: activo, inactivo o en mora.

Las columnas Razón social, CUIT, Condición IVA, Límite de crédito y Estado se
pueden ordenar haciendo clic en el encabezado. Saldo, Próx. vencimiento y
Concentración no se ordenan: se calculan al leer, no se guardan en una columna.

## Cuánto te debe cada cliente

El listado muestra tres columnas que no se cargan a mano, se calculan solas:

| Columna | Qué es |
|---|---|
| Saldo | Lo facturado menos lo cobrado. En negativo = el cliente tiene saldo a favor |
| Próx. vencimiento | La fecha de vencimiento más cercana **en el futuro** de sus comprobantes impagos |
| Concentración | Qué porcentaje del total a cobrar representa ese cliente |

El saldo cuenta solo los comprobantes en estado **Enviada** o **Aprobada**: un
borrador todavía no se le reclamó a nadie y un rechazado ya no se reclama.

El vencimiento de cada comprobante es su fecha de emisión más los días de la
condición de venta.

## Total a cobrar y concentración

Arriba del listado hay dos tarjetas:

- **Total a cobrar**: la suma de los saldos deudores de todos los clientes que
  matchean los filtros activos — no de la página que estás viendo. Si filtrás
  por Monotributo, el total es el de los monotributistas.
- **Mayor concentración**: qué porcentaje del total se lleva el cliente más
  grande, y cuál es.

La concentración mide **riesgo**. Si un solo cliente concentra el 40% de lo que
te deben y no te paga, no perdés un cobro: perdés casi la mitad de tu cuenta
corriente. Diez clientes con la misma plata repartida es mucho menos riesgoso.

Cuando el cliente más grande supera el umbral de la empresa, la tarjeta pasa a
**Atención** y el porcentaje de esa fila se marca en el listado. El umbral se
configura en [Parámetros](/parametros) y por defecto es 20%.

## Clientes en dólares

Los importes de las tarjetas y de la columna Saldo son **solo en pesos**. Si
hay comprobantes en otra moneda, aparece un aviso debajo de las tarjetas.

No se suman las monedas a propósito: un total que mezcla pesos y dólares es un
número que no existe.

## Límite de crédito

Es informativo: se carga a mano y sirve de referencia. El sistema no bloquea la
carga de un comprobante por superarlo.

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
