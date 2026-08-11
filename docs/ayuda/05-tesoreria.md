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
| Cliente | No | |
| Proveedor | No | |
| Cheque | Condicional | Obligatorio si el medio de pago es Cheque |
| Conciliado | No | Tilde |

### Dos reglas que dan error si no se respetan

1. Un movimiento **no puede tener cliente y proveedor a la vez**. Es uno o el
   otro, o ninguno.
2. Si el medio de pago es **Cheque**, hay que vincular el cheque. Sin eso no
   guarda.

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

### Filtros

Por estado y por rango de fechas, que aplica sobre la **fecha de pago** —que es
la que dice cuándo entra la plata.
