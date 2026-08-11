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
- **Evolución de ventas mensuales**.

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
