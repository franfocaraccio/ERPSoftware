# Panel

Pantalla en `/panel`. Es la portada: indicadores y gráficos.

Requiere el permiso **"Ver panel"**. Si un usuario no lo tiene, el menú lo
lleva igual pero la pantalla aparece vacía con un aviso. Lo habilita un
Administrador desde **Equipo**.

## Gráficos

- **Cobros y pagos por semana**: proyección de caja a 13 semanas. Las barras
  son los cobros y los pagos esperados; la línea es el saldo acumulado.
  Los cobros salen de los comprobantes de venta más la condición de venta en
  días; los pagos, de las compras más el plazo de pago del proveedor.
- **Evolución de ventas mensuales**: el total facturado por mes.

## Qué pasa con las notas de crédito

En todo el panel —las ventas por mes, el DSO, el margen y la proyección de
caja— una **nota de crédito resta** y una **nota de débito suma**, igual que en
la pantalla de clientes.

Dos consecuencias que conviene conocer:

- Un mes puede mostrar un total **negativo** si se emitieron notas de crédito
  que corrigen facturas de meses anteriores. No es un error: el mes muestra lo
  que efectivamente se facturó.
- En la proyección, una nota de crédito descuenta de los cobros de la semana en
  que vence, así que una semana puede quedar con cobros negativos.

## Indicadores

Cada tarjeta tiene un semáforo de tres estados: **ok**, **alerta** y **sin
datos**. "Sin datos" no es un error: significa que falta información para
calcular ese indicador (por ejemplo, margen sin costos cargados).

Indicadores disponibles:

- **Liquidez corriente**
- **DSO** (días promedio de cobro)
- **DPO** (días promedio de pago)
- **Días de rotación de stock**
- **Ciclo de conversión de efectivo**
- **Margen bruto porcentual**
- **Concentración de librador** (qué parte de la cartera de cheques depende de
  un solo librador)

## De dónde salen los umbrales

Los umbrales que deciden si un semáforo está en ok o en alerta se configuran en
**Parámetros**. No son valores fijos del sistema: cada empresa pone los suyos.

Si un indicador se ve siempre en alerta, lo primero a revisar es el umbral en
`/parametros`.

## Cotizaciones del dólar

Arriba a la derecha del panel aparecen el **dólar oficial** y el **blue**, cada
uno con su **compra** y su **venta**, y a la derecha la **variación** del día
con una flecha: roja hacia abajo si bajó, verde hacia arriba si subió, y una
raya si quedó igual.

La fecha de arriba es la del oficial, que se publica una vez por día hábil. Por
eso un lunes a la mañana ese valor es el del viernes, mientras el blue cotiza
durante toda la rueda.

Los datos salen de Ámbito. Su venta del oficial es **exactamente** la que
publica el BCRA, hasta el centavo; la compra la releva Ámbito, porque el BCRA no
la publica.

Es informativo: **el sistema no lo usa para convertir ningún importe**. Un
comprobante en dólares se guarda en dólares y no se mezcla con los pesos.

Si alguna cotización no se pudo traer, en su fila dice "Sin datos" y la otra se
muestra igual. No es un error del sistema.
