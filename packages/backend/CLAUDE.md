# CLAUDE.md — @erp/backend

Express 5 + tRPC 11 + Drizzle + BetterAuth + pg-boss. Proceso de larga duración en contenedor (Fly.io/Railway), NO serverless.

## Estructura

```
src/
  trpc/       initTRPC, context, middlewares, appRouter
  db/         schema Drizzle (un archivo por módulo), cliente, wrapper withTenant
  jobs/       definiciones pg-boss (cada job declara su tenant)
  modules/    slices verticales: clientes, proveedores, stock, tesoreria, impuestos, facturacion, financiero
  auth/       config BetterAuth + guards por rol
```

Cada módulo en `modules/<nombre>/` contiene `router.ts`, `service.ts`, `schema.ts` (Zod) y sus tests. La lógica de negocio financiera NO vive acá: vive en `@erp/core` y el service la invoca.

## Reglas específicas

- Ninguna query fuera de `withTenant(tenantId, ...)` — el wrapper hace `SET LOCAL app.tenant_id` dentro de la transacción. El `tenantId` sale de la sesión (`activeOrganizationId`), nunca de un input.
- Dinero: columna `numeric` → string en tRPC → `Money` (`@erp/core/money`) en services. Prohibido `parseFloat`/`Number()` sobre importes.
- Todo `.input()` de tRPC con Zod. Las respuestas de ARCA también se parsean con Zod antes de tocar el dominio.
- Entidades con estado: transiciones solo vía la función pura de transición; las respuestas incluyen `availableEvents`.
- Supabase Storage se accede solo desde acá con la service key. El frontend jamás ve esa key.
- Tests de services contra Postgres real, no mocks de Drizzle. La base sale de
  `DATABASE_URL`: en local es la de `docker compose`, en CI un service container.
  El aislamiento entre tests lo da RLS, no la base: cada uno crea su propia
  organización con `crearTenantDePrueba()`.

Ver skills: `trpc`, `drizzle`, `betterauth`, `arca`.
