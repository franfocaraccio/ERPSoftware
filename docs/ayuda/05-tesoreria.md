# Tesorería

Pantalla en `/tesoreria`. Tiene tres secciones: **cuentas**, **movimientos** y
**cheques**.

## Cuentas

Una cuenta es dónde está la plata. Campos:

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | Sí | Hasta 100 caracteres |
| Tipo | Sí | Efectivo, Cuenta corriente o Caja de ahorro |
| Moneda | Sí | ARS o USD. Default ARS |

El saldo de la cuenta no se carga: se calcula sumando sus movimientos.

## Movimientos

Cada movimiento es un ingreso o un egreso sobre una cuenta.

| Campo | Obligatorio | Notas |
|---|---|---|
| Fecha | Sí | |
| Cuenta | Sí | El movimiento hereda su moneda |
| Tipo | Sí | Ingreso o Egreso |
| Medio de pago | Sí | Efectivo, Transferencia o Cheque |
| Concepto | No | Hasta 300 caracteres |
| Importe | Sí | **Siempre positivo**: el signo lo pone el tipo |
| Contraparte | No | Un cliente o un proveedor |
| Categoría | No | Sólo sin contraparte: en qué se gastó o de dónde entró, para el estado de resultados (ver `/resultados`) |
| Cheque | Condicional | Obligatorio si el medio de pago es Cheque |
| Conciliado | No | Tilde |

### Dos reglas que dan error si no se respetan

1. Un movimiento **no puede tener cliente y proveedor a la vez**. Es uno o el
   otro, o ninguno.
2. Si el medio de pago es **Cheque**, hay que vincular el cheque. Sin eso no
   guarda.

### Imputar un cobro o un pago

Cuando el movimiento es un **ingreso de un cliente** o un **egreso a un
proveedor**, aparece la lista de sus comprobantes pendientes. Ahí se escribe
cuánto cancela de cada uno:

- Se puede repartir entre **varias** facturas y pagar **parte** de una.
- **Repartir automáticamente** completa los importes empezando por lo que vence
  antes.
- Lo que no se imputa queda **a cuenta** del cliente o proveedor. Está
  permitido: el sistema lo aplica a sus comprobantes más viejos al calcular
  saldos, y se ve en su ficha.
- No se puede imputar más que el importe del movimiento, ni más de lo que le
  queda a cada comprobante.

Si el medio de pago es **Cheque**, al elegir el cheque se completan solos el
importe y el cliente que lo libró.

### Filtros

Por cuenta, por tipo y por rango de fechas (aplica sobre la fecha del
movimiento).

## Cheques

Cartera de cheques recibidos.

| Campo | Obligatorio | Notas |
|---|---|---|
| Número | Sí | Hasta 50 caracteres |
| Librador | Sí | Un cliente de la lista **o** un nombre escrito a mano |
| Banco | No | |
| Fecha de emisión | No | |
| Fecha de pago | Sí | Cuándo se cobra |
| Importe | Sí | Mayor a cero |
| Estado | Sí | Ver abajo. Default "En cartera" |

Si no indicás librador —ni cliente ni nombre libre— da error.

### Estados

- **En cartera**: lo tenés, todavía no hiciste nada con él.
- **Depositado**: lo depositaste, falta que acredite.
- **Acreditado**: la plata entró.
- **Rechazado**: no tenía fondos.
- **Endosado**: se lo pasaste a un tercero. Es solo un estado descriptivo: no
  registra a quién se lo endosaste ni genera un egreso automático.

Los cheques son siempre en pesos.

### Depositar o endosar desde la lista

Los cheques **En cartera** tienen en su fila los botones **Depositar** y
**Endosar**, que cambian el estado sin abrir el formulario.

### Plazo para presentarlos

Un cheque se puede presentar al banco hasta **30 días después de su fecha de
pago**. Pasado ese plazo, el banco lo rechaza.

En la columna de cobro, un cheque vencido muestra cuántos días quedan para
presentarlo, en rojo cuando faltan 7 o menos. Si hay cheques en cartera que
caducan en los próximos 7 días, la pantalla lo avisa arriba de la lista.

### Filtros

Por estado y por rango de fechas, que aplica sobre la **fecha de pago** —que es
la que dice cuándo entra la plata.

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
