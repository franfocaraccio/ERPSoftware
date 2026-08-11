# Impuestos

Listado en `/impuestos`.

## Cargar una obligación

1. Entrá a **Impuestos** en el menú.
2. Apretá **Nueva obligación** (ruta directa: `/impuestos/nueva`).
3. Completá y guardá.

### Campos

| Campo | Obligatorio | Notas |
|---|---|---|
| Tipo | Sí | IVA, IIBB, Ganancias, Monotributo u Otros |
| Período | Sí | Mes en formato AAAA-MM |
| Base imponible | Sí | Importe |
| Alícuota | Sí | Porcentaje, máximo 100, hasta 3 decimales |
| Importe pagado | Sí | Default 0 |
| Fecha de vencimiento | Sí | |

## Editar

Clic en la fila del listado → `/impuestos/{id}`.

## Importe determinado y saldo

Ninguno de los dos se carga: se calculan.

- **Importe determinado** = base imponible × alícuota
- **Saldo** = importe determinado − importe pagado

Por eso no se puede ordenar el listado por esas dos columnas.

## Pagos

Hay **un solo campo de importe pagado** por obligación. No se registran N pagos
parciales con su fecha: si pagaste en dos veces, cargás la suma.

Una obligación está paga cuando el importe pagado cubre el determinado.

## Filtros

- **Tipo** de impuesto.
- **Solo impagos**: deja únicamente las que tienen saldo.
- **Rango de fechas**, que puede aplicar sobre **fecha de vencimiento** (el
  default, para no comerse un recargo) o sobre **período** (para cerrar un
  ejercicio). El selector de campo está al lado del rango.
