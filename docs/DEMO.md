# The public demo

A link anyone can open, with invented data, that resets itself. This describes
how it is meant to work and what is already in the repository for it. **Nothing
has been created on any provider** — the steps that need an account are marked
and are the operator's to run.

## What it has to be, and what it must not

The demo exists so a reader can click instead of taking the README's word for
it. That means it has to let people *do* things — create a customer, issue a
document, register a collection — which in turn means anyone can also empty it,
rename everything to nonsense, or leave it half-filled. So it must be
disposable, and it must be separate.

Three rules follow:

1. **Its own database.** Not a second organization inside the real one. Tenant
   isolation is good, and it is still not a reason to put strangers' writes in
   the same database as a company's books.
2. **Reset on a schedule**, so a bad hour is undone by itself rather than by
   someone noticing.
3. **Nothing that costs money per use.** The AI assistant is the only endpoint
   in the system where a request spends real money, so the demo runs with no
   key or a tiny daily cap.

## What is already in the repository

**`packages/backend/src/scripts/reset-demo.ts`** — empties one organization and
reloads it from `datos-demo.sql`, in a single transaction. Run with
`pnpm --filter @erp/backend demo:reset`.

It refuses to do anything unless **two** variables are set: `DEMO_TENANT_ID`,
the organization to reset, and `DEMO_RESET_HABILITADO=si`, which marks the
environment as one that may be wiped. The second exists for the evening someone
has a production `DATABASE_URL` pasted in their terminal.

The table list comes from the database itself — every table with a `tenant_id`
column — so a new module is covered without editing the script. Deletion order
is discovered by retrying: a table that fails on a foreign key waits for the
next pass, each attempt inside its own savepoint. The audit log is deliberately
left alone, because the application has `DELETE` revoked on it and a log the app
can erase is not a log; in the demo it simply accumulates.

Verified locally against an organization with 83 documents: 760 rows deleted,
86 sales reloaded, **the other organization on the same database untouched**,
and a second run produced the same result.

**`.github/workflows/reset-demo.yml`** — runs it daily at 09:00 UTC (06:00 in
Argentina) and on demand. It lives in Actions rather than in a container cron
for the same reason migrations do: resetting needs the owner role, and that
credential should exist only for the length of a job. If the `demo` environment
is not configured yet, the workflow says so and exits cleanly instead of failing
every night.

**`packages/backend/scripts/datos-demo.sql`** — six months of invented
movements. It now takes the organization from `app.tenant_id` when the caller
sets it, falling back to the lookup by email. That matters: one account can
belong to several organizations, and `limit 1` would otherwise empty one and
reload another.

## What the operator has to create

In order. Roughly half an hour.

### 1. A separate database

A new Supabase project — the free tier is enough. Then, **before migrating**,
create the application role by hand with a strong password:

```sql
create role erp_app login password '<generada>';
```

This matters. Migration `0001` creates `erp_app` with a weak default if the role
does not exist yet, and that password is public in this repository. Creating it
first means `IF NOT EXISTS` leaves it alone. Same procedure as the existing
environments.

Then apply the migrations with the owner role, exactly as CI does.

### 2. The demo account and its organization

Run the seed against the new database, then sign in once and note the
organization's id — that is `DEMO_TENANT_ID`.

Decide the credentials now, because they go in the README. Something obvious:
`demo@<dominio>` with a password that is not a secret.

### 3. A separate backend

A second Railway service from the same repository, with its own variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the new project, role `erp_app`, session mode |
| `BETTER_AUTH_SECRET` | a new one, not the real environment's |
| `FRONTEND_URL` | the demo frontend's URL |
| `BETTER_AUTH_URL` | the demo backend's URL |
| `ASISTENTE_LIMITE_DIARIO` | `10`, or leave the key out entirely |

Leaving `OPENAI_API_KEY` unset is the safe default: the assistant's bubble still
appears and the endpoint answers 503. Setting a key with a cap of ten questions
a day is the better demo, and it is a decision about money.

### 4. A separate frontend

A second Vercel project from the same repository with `VITE_API_URL` pointing at
the demo backend. The existing one keeps pointing where it does today.

### 5. Wire the reset

In the repository's Settings → Environments, create **`demo`** with:

- secret `DEMO_DATABASE_URL` — the owner-role connection string;
- variable `DEMO_TENANT_ID` — the organization id from step 2.

Then run the workflow once by hand to confirm it works before trusting the cron.

### 6. Point the README at it

The README already links a demo and says credentials are not published yet.
Once the account exists, that line gets the address and the login.

## What this costs

The Supabase free tier pauses a project after a week with no activity, which for
a demo nobody visited is fine — the next visitor wakes it, slowly. Railway is
around five dollars a month for a second always-on service. Vercel's free tier
does not permit commercial use, which a demo of a product being sold arguably
is; that question applies to the existing deployment too, and is noted in
[ADR 0011](adr/0011-a-portable-frontend.md).

## What is deliberately not solved

**Anyone can leave it ugly for up to a day.** A reset every hour would narrow
that window and would also interrupt someone mid-click. Daily, at dawn, is the
compromise.

**No rate limiting on writes.** Someone determined can fill the demo with
thousands of rows. The reset handles it the next morning; a real limit is work
that only matters if it actually happens.

**One shared organization**, so two simultaneous visitors see each other's
changes. Giving each visitor their own organization is the better demo and a
much larger job — it needs provisioning, cleanup, and quotas.
