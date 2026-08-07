---
name: trpc
description: Patrones de tRPC 11 en este repo — routers por slice, context con tenant, middlewares de auth y validación Zod en los bordes.
---

# tRPC en este repo

## Principios

- tRPC 11 sobre Express 5 (adapter de Express, proceso de larga duración).
- Un router por módulo de negocio en `packages/backend/src/modules/<modulo>/router.ts`, fusionados en el `appRouter` raíz de `packages/backend/src/trpc/`.
- El tipo `AppRouter` se exporta solo como tipo hacia el frontend (`import type`). Nunca código de servidor al cliente.

## Context

El context se construye por request y contiene:

- `session` — sesión BetterAuth resuelta del lado servidor.
- `tenantId` — **siempre** `session.activeOrganizationId`. Jamás un input del cliente.
- `db` — el wrapper de transacción con `SET LOCAL app.tenant_id` (ver skill `drizzle`). Los procedures no reciben el pool crudo.

## Middlewares (cadena estándar)

1. `publicProcedure` — solo login/invitaciones/health.
2. `protectedProcedure` — exige sesión válida.
3. `tenantProcedure` — exige `activeOrganizationId` presente; inyecta `tenantId` y el `db` ya tenantizado.
4. Sobre `tenantProcedure`, guards por rol: `administrador`, `escritura_lectura`, `solo_lectura` (ver skill `betterauth`).

Todo procedure de negocio parte de `tenantProcedure` o de un guard por rol. Si un procedure usa `protectedProcedure` a secas para tocar datos de negocio, está mal.

## Validación

- Todo `.input()` con schema Zod. Sin excepciones, incluso para un solo `id`.
- Dinero viaja como **string** por el borde tRPC (`z.string()` + refinamiento decimal); se convierte a `Money` al entrar al service y de vuelta a string al salir.
- Los outputs con entidades con estado incluyen `availableEvents` calculado con la máquina de transición pura.

## Errores

- Errores de negocio → `TRPCError` con `code` semántico (`BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`).
- Nunca filtrar detalles de otro tenant en mensajes de error (un id inexistente y un id ajeno responden igual: `NOT_FOUND`).

## Precaución

No inventar firmas de la API de tRPC. Ante duda sobre `initTRPC`, middlewares encadenados o el adapter de Express, verificar en https://trpc.io/docs antes de escribir código.
