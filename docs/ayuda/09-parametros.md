# Parámetros

Pantalla en `/parametros`. Son los umbrales de la empresa: de ellos dependen
los semáforos del panel y el de concentración en Clientes.

| Parámetro | Qué hace |
|---|---|
| Umbral de mora (días) | Días de atraso a partir de los cuales un cliente queda **en mora**, y el DSO pasa a rojo en el panel. Entre 1 y 365 |
| Margen objetivo (%) | Margen bruto que la empresa se propone. Vacío = sin objetivo definido |
| Mínimo operativo | Piso de caja de la proyección a 13 semanas, en pesos. Vacío = sin piso |
| Umbral de concentración (%) | Cuánto puede representar un solo cliente dentro del total a cobrar antes de que la pantalla de Clientes lo marque. Por defecto 20% |

Margen objetivo y Mínimo operativo se pueden dejar vacíos: el indicador
correspondiente queda en "sin datos" en vez de mostrar un semáforo que no
significa nada.

Umbral de mora y Umbral de concentración **no** se pueden dejar vacíos: sin
ellos no habría contra qué comparar.

Estos valores son **por empresa**. No hay valores fijos del sistema: cada PyME
define los suyos según su rubro.

Si en el panel un indicador aparece siempre en alerta, revisá acá antes de
concluir que hay un problema en los datos.
