# Generalidades

ERP para PyMEs argentinas. Cubre clientes, proveedores, stock, comprobantes de
venta, tesorería, impuestos y un panel de indicadores.

## Navegación

El menú lateral izquierdo tiene estos destinos:

| Menú | Ruta | Para qué |
|---|---|---|
| Panel | `/panel` | Indicadores y gráficos |
| Clientes | `/clientes` | Padrón de clientes |
| Proveedores | `/proveedores` | Padrón de proveedores |
| Stock | `/stock` | Productos, precios y existencias |
| Tesorería | `/tesoreria` | Cuentas, movimientos y cheques |
| Impuestos | `/impuestos` | Obligaciones impositivas |
| Comprobantes | `/comprobantes` | Facturas de venta y compras |
| Equipo | `/equipo` | Usuarios de la empresa |
| Parámetros | `/parametros` | Umbrales del panel |
| Historial | `/historial` | Auditoría de cambios |
| Accesos | `/accesos` | Links de solo lectura |

En celular el menú se abre con el botón de las tres rayas arriba a la izquierda.

## Roles

Cada usuario tiene uno de estos tres roles dentro de la empresa:

- **Administrador**: hace todo, incluido invitar usuarios y cambiar roles.
- **Escritura/Lectura**: carga y edita datos, pero no gestiona usuarios.
- **Solo lectura**: solo consulta. No ve los botones de crear ni editar.

Aparte del rol existe el permiso **"Ver panel"**, que se otorga por separado.
Un usuario puede tener rol de Escritura/Lectura y aun así no ver el panel de
indicadores, si al invitarlo se destildó esa opción.

## Modo solo lectura

Si entrás por un link de acceso compartido (ver Accesos), la aplicación queda
en modo solo lectura: no aparece ningún botón de crear ni de editar. Es
esperado, no es un error.

## Cómo se escriben los importes

Los importes se cargan con **punto** como separador decimal y hasta 2
decimales: `1500.50`. No se usa separador de miles.

Las cantidades de stock admiten hasta 3 decimales.

Las fechas se eligen con el selector de fecha de cada formulario.

## Monedas

El sistema maneja ARS y USD. Cada cuenta de tesorería tiene su moneda y los
movimientos heredan la moneda de la cuenta. Los cheques y los impuestos son
siempre en pesos.
