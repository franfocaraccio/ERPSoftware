# ERP PyME

ERP SaaS multi-tenant para PyMEs argentinas, con facturación electrónica integrada contra ARCA (ex AFIP).

## Stack

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript `strict`, Biome
- **Frontend:** Vite + React 19, TanStack (Router / Query / Form / Table), shadcn/ui sobre Base UI + Tailwind v4, tRPC client
- **Backend:** Express 5 + tRPC 11, Drizzle ORM, BetterAuth, pg-boss, Zod
- **Datos:** Supabase Postgres (RLS con `SET LOCAL app.tenant_id`) + Supabase Storage
- **Dominio:** `decimal.js` con value object `Money`, máquinas de estado como funciones de transición puras

## Levantar el entorno local

Requiere **Docker Desktop andando** (la base corre en un contenedor) y `pnpm install` hecho al menos una vez.

```bash
docker compose up -d   # Postgres 17 en localhost:5432
pnpm dev               # backend (3001) y frontend (5173), los dos con recarga en caliente
```

Y listo: la app queda en **http://localhost:5173**. Se corta con `Ctrl+C` en la terminal del `pnpm dev`; el contenedor de Postgres sigue vivo aparte (`docker compose stop` para apagarlo).

| Servicio | Dónde | Cómo se revisa |
|---|---|---|
| Frontend (Vite) | http://localhost:5173 | abrirlo en el navegador |
| Backend (Express + tRPC) | http://localhost:3001 | `curl http://localhost:3001/health` → `{"ok":true}` |
| Postgres | localhost:5432 (`erp`/`erp`) | `docker compose ps` |

### La primera vez, o con la base recién creada

```bash
cd packages/backend && pnpm db:migrate   # aplica las migraciones pendientes
cd packages/backend && pnpm db:seed      # crea el admin de plataforma y la empresa de prueba
```

El seed es idempotente: se puede correr las veces que haga falta. Imprime las credenciales al terminar.

### Cuando algo no arranca

- **`error during connect: ... dockerDesktopLinuxEngine`** → Docker Desktop está cerrado. Abrilo y esperá a que el ícono deje de parpadear (tarda ~40 s), después `docker compose up -d`.
- **El backend arranca y se cae** → casi siempre es la base: `docker compose ps` tiene que mostrar `running`. Si el contenedor está arriba pero rechaza conexiones, `docker compose exec postgres pg_isready -U erp -d erp`.
- **`EADDRINUSE`** → quedó un `node` viejo tomando el 5173 o el 3001. En PowerShell: `Get-NetTCPConnection -State Listen -LocalPort 5173,3001` y `Stop-Process -Id <pid> -Force`.
- **La app carga pero no trae datos** → falta correr las migraciones, o el backend no está: mirá `/health`.

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
