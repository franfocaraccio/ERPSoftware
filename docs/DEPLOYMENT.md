# Deployment

How this runs in the cloud, and why each piece is where it is. The operational
runbook — hostnames, credentials, incident history — is deliberately not in
this repository.

## Three independent pieces

| Piece | Platform | Deploys on |
| --- | --- | --- |
| Frontend (Vite SPA) | Vercel | push to `main` |
| Backend (Express) | Railway | push to `main` |
| Postgres + object storage | Supabase | migrations, from CI |

Each one can be replaced without touching the others, and that portability is
enforced rather than hoped for: the frontend uses **no `@vercel/*` package**
and reads the API location from `VITE_API_URL`, so moving it to any static CDN
is a build-and-upload. Supabase is used as plain managed Postgres and storage,
reached **only from the backend** — never `supabase-js` in the browser.

## The backend is a long-running container, not a function

Railway runs a Docker container with Express alive 24/7. Scale-to-zero and
idle suspension must stay off.

The reason is background work: recalculating the cash-flow projection, KPI
snapshots, due-date alerts and retrying electronic invoicing are meant to run
as jobs inside this same process, so a container that falls asleep would
silently stop doing them. Calls to the tax authority also need retries that outlive a function's
execution limit.

Today this is a constraint on the architecture rather than a description of it:
the job runner is not implemented yet, so there is nothing to lose when the
container restarts. The decision is recorded now because it is the kind of
thing that gets violated by a hosting choice made later, for reasons that look
unrelated.

## Migrations run from CI, never from the container

Applying a migration needs the owner role, which can bypass row-level security
and therefore read every tenant's data. That credential has no business living
in a process exposed to the internet, so it exists only for the length of a CI
job. The `Dockerfile` installs with `--prod` and leaves `drizzle-kit` out of
the image, so the container cannot migrate even by accident.

- **Development** is automatic: migrations run after lint, typecheck, tests and
  build, only on push to `main`. Railway waits for CI, so the order is
  guaranteed — tests, then migrations, then the new code. A failed migration
  stops the deploy instead of pairing new code with an old schema.
- **Production** is manual, in a separate workflow that only starts from *Run
  workflow* and requires typing a confirmation phrase. It is separate because
  Railway waits for *every* Action to finish: a job sitting on an approval
  would hold every deploy.

Migrations are written by hand, are idempotent, and each one gets its entry
added to `drizzle/meta/_journal.json` by hand. Generated migrations are not
used: the schema carries RLS policies, grants and check constraints that a
differ does not produce.

**The backend verifies migrations at startup** and refuses to boot if the
database is behind the code, naming what is missing
([`src/db/migraciones.ts`](../packages/backend/src/db/migraciones.ts)).
Without that check, a code deploy that lands before its migration shows up as
scattered 500s on the first query that touches a new column. If the database is
*ahead* — a code rollback — it warns and boots, because rolling back is
legitimate.

## Local development

Postgres in Docker, the apps on the machine:

```bash
docker compose up -d   # Postgres 17 on localhost:5432
pnpm dev               # backend on 3001, frontend on 5173
```

Integration tests run against that same Postgres with the application role,
which cannot bypass RLS — so tenant isolation is exercised by every test rather
than asserted once. In CI the database is an ephemeral service container.
Testcontainers is not used: isolation between tests comes from RLS, because
each test creates its own organization.
