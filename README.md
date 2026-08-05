# ERP PyME

ERP SaaS multi-tenant para PyMEs argentinas, con facturación electrónica integrada contra ARCA (ex AFIP).

## Stack

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript `strict`, Biome
- **Frontend:** Vite + React 19, TanStack (Router / Query / Form / Table), shadcn/ui sobre Base UI + Tailwind v4, tRPC client
- **Backend:** Express 5 + tRPC 11, Drizzle ORM, BetterAuth, pg-boss, Zod
- **Datos:** Supabase Postgres (RLS con `SET LOCAL app.tenant_id`) + Supabase Storage
- **Dominio:** `decimal.js` con value object `Money`, máquinas de estado como funciones de transición puras

## Estructura

```
/packages
  /backend        Express + tRPC + Drizzle + BetterAuth + pg-boss
  /frontend       Vite SPA
  /design-system  shadcn/ui + tema + componentes compartidos
  /core           Dominio puro — sin DB, sin HTTP, sin I/O
  /arca           Integración WSAA / WSFEv1
```

Ver [CLAUDE.md](CLAUDE.md) para las reglas del proyecto.
