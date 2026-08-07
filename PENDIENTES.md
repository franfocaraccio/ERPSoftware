# Pendientes

Estado real del proyecto, verificado contra el código. Lo que está acá es lo que
falta; lo que no está, está hecho.

## Fase Z — bloqueado, no se toca por ahora

Cosas que no dependen de escribir código nuestro. No se planifican ni se estiman
hasta que se destraben.

- **Envío de mails (Resend).** El código está listo y enganchado en
  `packages/backend/src/auth/emails.ts`: sin `RESEND_API_KEY` cae a imprimir el
  mensaje en la consola del backend. Bloquea que invitaciones y recuperación de
  contraseña salgan de la máquina de desarrollo.
  - Mientras tanto: el link de invitación se puede copiar desde `/equipo` y
    desde `/admin`. El de recuperación **no** se muestra en pantalla a
    propósito —sería entregarle la cuenta a cualquiera que escriba un mail—;
    aparece solo en la consola del backend.

## Fase 1 — huecos funcionales

- **Visor del audit log.** Se registra todo lo que toca saldos, stock, impuestos
  y permisos, pero no hay pantalla para consultarlo.

## Fase 2

- **Vista Consolidada de solo lectura con magic link.** El plugin ya está
  configurado; faltan ruta y pantalla. Es lo que le va a dar sentido propio al
  rol Solo lectura, que hoy ve lo mismo que los demás.
- **Histórico de KPIs y selector dinámico de indicadores.**

## Fase 3 — ARCA

- **`packages/arca` es un stub** (`export {}`): falta WSAA, WSFEv1, CAE, QR, PDF
  y la suite contra homologación.
- **Guardia de MFA obligatorio** para los roles que emiten comprobantes
  (`ROLES_CON_MFA_OBLIGATORIO` ya está declarado, sin aplicar).

## Infraestructura

- Sin CI (no existe `.github/workflows`).
- Sin deploy: ni frontend en CDN, ni backend en contenedor, ni Postgres
  administrado.
- Sin Sentry ni monitoreo.
- Los tests corren contra la base de desarrollo, no contra Testcontainers.
- **Antes de cualquier deploy:** `BETTER_AUTH_SECRET` sigue siendo el placeholder
  de desarrollo y las credenciales del seed son las de ejemplo.
