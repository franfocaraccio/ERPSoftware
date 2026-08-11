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
pueden ordenar haciendo clic en el encabezado.

## Límite de crédito

Es informativo: se carga a mano y sirve de referencia. El sistema no bloquea la
carga de un comprobante por superarlo.
