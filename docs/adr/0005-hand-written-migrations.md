# 0005 — Migrations written by hand and idempotent

**Status:** accepted

## Context

Drizzle can generate migrations by diffing the schema. The diff only sees what
the schema file describes — tables, columns, indexes. This database also
carries RLS policies, grants, `FORCE ROW LEVEL SECURITY`, check constraints
and a role, none of which survive a regeneration. A generated migration that
silently drops a policy is a tenant isolation hole shipped by a tool.

## Decision

Migrations are written by hand, are idempotent (`IF NOT EXISTS`, `DO $$`
blocks), and each one gets its entry added to `drizzle/meta/_journal.json` by
hand. They are applied from CI with an owner role that exists only for the
length of the job; the serving container ships without `drizzle-kit` and
cannot apply them at all. Production is a separate manual workflow requiring a
typed confirmation phrase.

The backend checks at startup that the database is not behind the code, and
refuses to boot if it is.

## Consequences

- Policies and grants are part of the migration, so the chain applied from
  scratch in CI is exactly what runs against the real database.
- Writing one is slower, and the journal entry is easy to forget.
- An applied migration must never be edited — changing even a comment changes
  its hash and `drizzle-kit` would apply it again.
- Code deploys and schema deploys are two separate events that can be out of
  step; the startup check turns that into a clear refusal instead of scattered
  500s.
