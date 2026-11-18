# 0002 — Tenant isolation in Postgres with RLS, not a `where` in the application

**Status:** accepted

## Context

Several companies share one database. The usual approach is a
`where tenant_id = ?` in every query. It works until the day someone writes a
query without it — a report, a join, a quick fix — and that one omission
leaks one company's data to another. There is no way to notice it in review
reliably, and the failure is silent: the query returns rows, just the wrong
ones.

## Decision

Isolation is the database's job. Every business table has row-level security
enabled with `FORCE`, and one policy comparing `tenant_id` against
`current_setting('app.tenant_id', true)`. Business code reaches the database
only through `withTenant`, which opens a transaction and sets that variable.
The application connects as a role with no `BYPASSRLS` and no table ownership.

The second argument of `current_setting` is what makes the failure safe: with
no variable set, the comparison is against `NULL` and the query returns
nothing.

## Consequences

- **Forgetting the wrapper returns no rows, never another company's rows.**
  That is the whole point: the worst case becomes an empty screen instead of a
  data breach.
- CI runs the test suite as that restricted role, so a query that escapes the
  wrapper fails the build.
- Migrations need a different, more powerful role, which must never be the one
  the server uses. That split has to be maintained (see
  [0005](0005-hand-written-migrations.md)).
- Foreign keys are still checked **without** RLS, so ids coming from the
  client need an explicit ownership check; `exigirPropios` does it.
- Connection pooling has to preserve transaction boundaries, which rules out
  some pooler modes.
