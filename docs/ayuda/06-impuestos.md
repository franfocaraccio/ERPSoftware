# Impuestos

Listado en `/impuestos`. Muestra todas las obligaciones: las que se cargan a
mano y las posiciones de IVA que calcula el sistema.

Qué impuestos aparecen depende del **régimen fiscal** de la empresa, que se
configura en `/parametros`:

| Régimen | Impuestos |
|---|---|
| Responsable Inscripto | IVA (calculado), IIBB, Ganancias, Otros |
| Monotributo | Monotributo, IIBB, Otros |

## IVA: lo calcula el sistema

Para un Responsable Inscripto, el IVA de cada mes **no se carga**. Sale de los
comprobantes:

- **Débito fiscal**: el IVA de las ventas del mes (fecha de emisión). Las notas
  de crédito restan.
- **Crédito fiscal**: el IVA de las compras del mes (fecha de recepción).
- **A pagar** = débito − crédito − saldo a favor del mes anterior. Si da
  negativo no se paga nada y la diferencia pasa como **saldo a favor** al mes
  siguiente.

Sólo cuentan los comprobantes **Enviados** o **Aprobados**, en pesos.

Debajo del listado está la tabla **Posición de IVA**, mes por mes, con cada uno
de esos números.

El vencimiento es el día del mes siguiente que se configura en `/parametros`
(**Día de vencimiento del IVA**, 20 por defecto). Depende de la terminación del
CUIT: conviene ajustarlo al calendario de ARCA.

### Registrar el pago del IVA

Clic en el IVA del mes en el listado → se abre el formulario con el período
completo. Se carga sólo **lo que se pagó** y la fecha de vencimiento real.

### IVA cargado a mano antes

Si un mes ya tenía un IVA cargado a mano (antes de que el sistema lo
calculara), ese registro se conserva como **histórico** y el sistema no calcula
ese mes, para no contarlo dos veces.

## Cargar otra obligación

1. Apretá **Nueva obligación** (ruta directa: `/impuestos/nueva`).
2. Elegí el tipo y el período.
3. Completá la determinación según el tipo:

| Tipo | Cómo se determina |
|---|---|
| IIBB | Base imponible × alícuota, o un importe fijo |
| Ganancias | Concepto (Anticipo 1 a 10, o Saldo DDJJ) e importe |
| Monotributo | La cuota del mes |
| Otros | Base × alícuota, o un importe fijo |

Los importes de Ganancias son **los que informa ARCA o el contador**: el sistema
no estima el impuesto.

## Retenciones y percepciones de IIBB

Debajo del listado está la sección **Retenciones y percepciones de IIBB**, que
incluye **SIRCREB** (lo que retiene el banco sobre las acreditaciones). Cada una
se carga con su fecha, el **período de IIBB** del que se descuenta, el agente,
el comprobante y el importe.

Se **descuentan solas** del IIBB de ese período: el listado muestra el IIBB
**bruto**, los **créditos** (las retenciones) y lo **determinado** que queda. Si
las retenciones superan el impuesto del mes, la diferencia pasa como saldo a
favor al mes siguiente.

Sólo se cargan las de IIBB. Las retenciones de IVA y de Ganancias no se
registran en el sistema.

## Editar

Clic en la obligación del listado → `/impuestos/{id}`. El tipo no se cambia: si
está mal, cargá otra.

## Determinado y saldo

Ninguno de los dos se carga: se calculan.

- **Determinado** = bruto − créditos (crédito fiscal y saldo a favor en el IVA,
  retenciones en IIBB).
- **Saldo** = determinado − importe pagado.

## Pagos

Hay **un solo campo de importe pagado** por obligación. Si pagaste en dos veces,
cargás la suma. Una obligación está paga cuando lo pagado cubre lo determinado.

## Filtros

- **Tipo** de impuesto.
- **Solo impagos**: deja únicamente las que tienen saldo.
- **Rango de fechas**, que puede aplicar sobre **fecha de vencimiento** (el
  default, para no comerse un recargo) o sobre **período** (para cerrar un
  ejercicio).
