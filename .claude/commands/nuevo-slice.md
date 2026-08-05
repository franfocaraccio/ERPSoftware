---
description: Scaffoldea un slice vertical completo para un módulo de negocio (backend + frontend)
argument-hint: <nombre-del-modulo>
---

Creá el slice vertical para el módulo **$ARGUMENTS**, usando el módulo `clientes` como plantilla de referencia.

Backend (`packages/backend/src/modules/$ARGUMENTS/`):
1. `schema.ts` — schemas Zod de input/output del módulo.
2. `service.ts` — lógica sobre el wrapper `withTenant`; cálculos financieros SIEMPRE delegados a `packages/core`.
3. `router.ts` — router tRPC con `tenantProcedure` y guards por rol; registrarlo en el `appRouter`.
4. `*.test.ts` — tests del service.

Frontend (`packages/frontend/src/features/$ARGUMENTS/`):
5. Pantalla de listado con TanStack Table + componentes del design system.
6. Formulario de alta/edición con TanStack Form + los mismos schemas Zod.
7. Ruta en TanStack Router.

Antes de escribir, leé las skills `trpc`, `drizzle` y `shadcn`, y verificá que la tabla Drizzle del módulo ya exista (si no existe, frená y avisá). Al terminar: `pnpm typecheck && pnpm lint && pnpm test`.
