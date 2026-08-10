# Pendientes

Estado real del proyecto, verificado contra el código. Lo que está acá es lo que
falta; lo que no está, está hecho.

Fase 1 y Fase 2 no tienen nada pendiente.

## Descartado

- **Histórico de KPIs y selector dinámico de indicadores.** Decisión de Fran:
  no se hace, el panel se queda con la foto del momento. Si alguna vez se
  retoma, el análisis ya está: caja, cobranzas, saldo a pagar, ventas, compras,
  margen, cheques e impuestos se pueden recalcular a cualquier fecha pasada
  porque los movimientos tienen fecha y apuntan al comprobante que cancelan;
  rotación de stock y ciclo de conversión no, porque `stock_actual` es un valor
  de hoy sin historia (decisión de Fase 1: sin tabla de movimientos de stock).

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

- Sin deploy: no hay ningún entorno levantado todavía. El backend ya está
  containerizado; falta crear las cuentas y configurar Supabase, Railway y
  Vercel. El estado detallado y los problemas abiertos están en `DEPLOY.md`.
- Sin Sentry ni monitoreo.
- **Antes de cualquier deploy:** `BETTER_AUTH_SECRET` sigue siendo el placeholder
  de desarrollo y las credenciales del seed son las de ejemplo.
