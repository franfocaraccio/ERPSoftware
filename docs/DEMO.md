# The public demo

A link anyone can open, with invented data, that resets itself.

**The deployed environment *is* the demo.** There is one deployment, not two, and
it will never hold a real company's books. That is a decision, not a stage on the
way to something else, and the rest of this document depends on it.

## Why one environment and not two

An earlier version of this plan called for a second, separate deployment. The
reason was an assumption: that the existing one would eventually hold real
data — an actual company's invoices and balances — at which point letting
strangers write into it stops being acceptable.

That is not where this is going. The deployment exists to be clicked on by
people reading this repository. So separating it from a production environment
that does not exist buys nothing and costs a second always-on service.

The consequence worth stating plainly: **anyone who opens the link can create,
edit and delete anything in it.** That is the point — a demo you cannot touch is
a screenshot — and it is only tolerable because every figure in it is invented.

## What follows from that

1. **Nothing real goes in.** Not one actual invoice, not one actual customer,
   not as a quick test. The reset below deletes everything in the organization
   every morning, so anything real put there would be destroyed on a schedule;
   and the demo is public, so until then it would be readable by anyone.
2. **Reset on a schedule**, so a bad hour undoes itself rather than waiting for
   someone to notice.
3. **Nothing that costs money per use.** The AI assistant is the only endpoint
   in the system where a request spends real money, so the demo runs with no
   key, or with a small daily cap.

## How the reset works

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
credential should exist only for the length of a job. While the `demo`
environment is not configured, the workflow says so and exits cleanly instead of
failing every night.

**`packages/backend/scripts/datos-demo.sql`** — six months of invented
movements. It takes the organization from `app.tenant_id` when the caller sets
it, falling back to the lookup by email. That matters: one account can belong to
several organizations, and `limit 1` would otherwise empty one and reload
another.

## What the operator has to do

The deployment already exists, so this is short.

### 1. Rotate the application role's password

Migration `0001` creates `erp_app` with the password `erp_app` **if the role
does not exist yet**, and that line is public in this repository. Whether the
deployed database ended up with that default depends on whether the role was
created by hand first, months ago.

Do not try to find out — reading the stored password needs `pg_authid`, which
is superuser-only and which a managed Postgres will refuse. Rotating costs the
same and settles it:

```sql
alter role erp_app password '<generated>';
```

Then update `DATABASE_URL` in the backend's variables and redeploy. The role
keeps every grant it had; only the password changes.

Row-level security does not cover this. RLS protects against a bug in this
codebase forgetting to scope a query; it does nothing against someone holding
`erp_app`'s password, because they can set `app.tenant_id` to whatever they
like.

### 2. Decide what the assistant costs

`ASISTENTE_LIMITE_DIARIO` defaults to **100 questions per day**. On a public
link with an `OPENAI_API_KEY` set, that is strangers spending real money.

Leaving the key unset is the safe default: the assistant's bubble still appears
and the endpoint answers 503. Setting a key with a cap of ten a day is the
better demo, and it is a decision about money rather than about code.

### 3. Wire the reset

In the repository's Settings → Environments, create **`demo`** with:

- secret `DEMO_DATABASE_URL` — the owner-role connection string;
- variable `DEMO_TENANT_ID` — the demo organization's id.

Then run the workflow once by hand to confirm it works before trusting the cron.

### 4. Publish the credentials

The README links the demo and says the credentials are not published yet. Once
they are decided — something obvious, not a secret — that line gets the login.

## What this costs

The Supabase free tier pauses a project after a week with no activity, which for
a demo nobody visited is fine: the next visitor wakes it, slowly. This already
happened once and the symptom is worth recognising — `/health` answers while
every login returns 500. Vercel's free tier does not permit commercial use,
which a demo of a product being sold arguably is; that is noted in
[ADR 0011](adr/0011-a-portable-frontend.md).

## What is deliberately not solved

**Anyone can leave it ugly for up to a day.** A reset every hour would narrow
that window and would also interrupt someone mid-click. Daily, at dawn, is the
compromise.

**No rate limiting on writes.** Someone determined can fill the demo with
thousands of rows. The reset handles it the next morning; a real limit is work
that only matters if it actually happens.

**One shared organization**, so two simultaneous visitors see each other's
changes. Giving each visitor their own is the better demo and a much larger
job — it needs provisioning, cleanup and quotas.

## If this decision ever changes

The day a real company's books are supposed to live in this system, they do
**not** go into this deployment. They go into a new one, and this document goes
back to describing a separate demo: a second database, a second backend, a
second frontend, and the `demo` environment repointed at it. The reset script
and workflow need no changes — they already take their target from the
environment, which is why they are written that way.
