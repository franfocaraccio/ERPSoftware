---
name: betterauth
description: BetterAuth en este repo — organizaciones como tenants, invitaciones, roles del dominio, magic links y MFA obligatorio.
---

# BetterAuth en este repo

## Configuración

- Config en `packages/backend/src/auth/`. Plugins: `organization`, `admin`, `magic-link`, `two-factor`.
- Organización = tenant. Tabla de miembros muchos-a-muchos: **un mail puede pertenecer a varios tenants** (contador con varias PyMEs).
- `activeOrganizationId` de la sesión es la única fuente del `tenantId` (ver skill `trpc`).
- Adapter de Drizzle contra el mismo Postgres; las tablas de auth NO llevan RLS por tenant (son globales), sí el resto.

## Registro y onboarding

- **Registro público desactivado.** Nadie se registra solo: el alta es por invitación validada del lado servidor antes de crear el usuario.
- Dos niveles: nosotros (admin de plataforma) invitamos al Dueño de la PyME; el Dueño invita a su equipo.
- Mails transaccionales vía Resend, enchufado en el hook `sendInvitationEmail` del plugin organization.
- Sin SSO. Email + contraseña vía invitación.
- **Magic links** solo para el panel read-only de la Vista Consolidada.

## Roles del dominio

| Rol | Alcance |
|---|---|
| `dueno` | Todo, incluida delegación ARCA y gestión de usuarios |
| `administrativo` | Comprobantes, tesorería, impuestos |
| `contador` | Solo lectura + descarga de comprobantes e impuestos |
| `solo_lectura` | Vista Consolidada únicamente |

- Los roles se modelan con los roles por organización del plugin `organization` y se chequean en middlewares tRPC (guards sobre `tenantProcedure`), nunca solo en la UI.
- **MFA (two-factor) obligatorio** para roles que emiten comprobantes o tocan configuración ARCA (`dueno`, `administrativo`): el middleware rechaza esas operaciones si la sesión no tiene 2FA verificado.

## Precaución

La API de BetterAuth cambia entre versiones (hooks de plugins, nombres de tablas del adapter, shape de la sesión). No inventar firmas: verificar en https://www.better-auth.com/docs antes de escribir código, y correr el generador de schema del adapter en lugar de escribir las tablas de auth a mano.
