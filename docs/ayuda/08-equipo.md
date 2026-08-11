# Equipo — usuarios y permisos

Pantalla en `/equipo`. Solo la ven y la usan los **Administradores**.

## Crear un usuario nuevo (invitar)

No se "crea" un usuario con contraseña: se lo **invita por email** y la persona
elige su propia contraseña al aceptar.

1. Entrá a **Equipo** en el menú.
2. Apretá **Invitar**.
3. Escribí el **email** de la persona.
4. Elegí el **rol**.
5. Dejá o quitá el tilde de **Ver panel** (viene tildado por defecto).
6. Enviá la invitación.

La persona recibe un mail con un link. Al abrirlo cae en
`/aceptar-invitacion/{id}`, define su contraseña y queda dentro de la empresa.

Mientras no la acepte, la invitación figura como pendiente y se puede
**cancelar** desde la misma pantalla.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo, incluido invitar usuarios, cambiar roles y quitar miembros |
| Escritura/Lectura | Cargar y editar datos de negocio. No gestiona usuarios |
| Solo lectura | Únicamente consultar |

Una empresa puede tener más de un Administrador.

## Cambiar el rol de alguien

Desde **Equipo**, en la fila del usuario. El cambio es inmediato.

## Ver panel

Es un permiso aparte del rol. Se puede activar o desactivar por usuario en
cualquier momento desde **Equipo**, sin tocar su rol.

## Quitar a alguien

Desde **Equipo**, acción "Quitar". Pierde el acceso a la empresa.

## Recuperar la contraseña

Desde la pantalla de login, link **"¿Olvidaste tu contraseña?"** → `/recuperar`.
Llega un mail con un link que lleva a `/restablecer`.
