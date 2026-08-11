# Parámetros

Pantalla en `/parametros`. Son los umbrales de la empresa: de ellos dependen
los semáforos del panel.

| Parámetro | Qué hace |
|---|---|
| Umbral de mora (días) | Días de mora a partir de los cuales el DSO pasa a rojo en el panel. Entre 1 y 365 |
| Margen objetivo (%) | Margen bruto que la empresa se propone. Vacío = sin objetivo definido |
| Mínimo operativo | Piso de caja de la proyección a 13 semanas, en pesos. Vacío = sin piso |

Los dos últimos se pueden dejar vacíos: el indicador correspondiente queda en
"sin datos" en vez de mostrar un semáforo que no significa nada.

Estos valores son **por empresa**. No hay valores fijos del sistema: cada PyME
define los suyos según su rubro.

Si en el panel un indicador aparece siempre en alerta, revisá acá antes de
concluir que hay un problema en los datos.
