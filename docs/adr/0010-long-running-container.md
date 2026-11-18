# 0010 — A long-running container, not serverless

**Status:** accepted

## Context

The default hosting answer for a TypeScript backend is functions. This system
has work that does not fit a request: recalculating the cash projection, KPI
snapshots, due-date alerts, and retrying submissions to the tax authority
after a failure. It also needs `pg_advisory_xact_lock` held across a
transaction for gapless numbering, which requires a connection in session
mode — a transaction pooler can hand the next statement to a different
backend, and the lock means nothing.

## Decision

The backend runs as a Docker container with the process alive 24/7.
Scale-to-zero and idle suspension stay off. The job runner lives inside that
process.

## Consequences

- Background work and transaction-scoped locks are possible, and a host that
  sleeps the container would silently break both.
- There is a fixed monthly cost instead of a per-request one, and idle time is
  paid for.
- The constraint has to be written down, because it is exactly the kind of
  thing a later hosting change violates for reasons that look unrelated.
- **Today it is a constraint, not a description**: the job runner is not
  implemented, so nothing is lost when the container restarts.
