# Pendientes

Estado real del proyecto, verificado contra el código. Lo que está acá es lo que
falta; lo que no está, está hecho.

## Fase 2

- **Histórico de KPIs y selector dinámico de indicadores.**

## Fase 3 — TBD

- **Envío de mails (Resend).** Bloqueado por algo que no es escribir código: la
  API key. El resto está listo y enganchado en
  `packages/backend/src/auth/emails.ts`; sin la key cae a imprimir el mensaje en
  la consola del backend. Mientras siga así, invitaciones y recuperación de
  contraseña no salen de la máquina de desarrollo.
  - Mientras tanto: el link de invitación se puede copiar desde `/equipo` y
    desde `/admin`. El de recuperación **no** se muestra en pantalla a
    propósito —sería entregarle la cuenta a cualquiera que escriba un mail—;
    aparece solo en la consola del backend.
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
