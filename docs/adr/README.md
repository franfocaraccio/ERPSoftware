# Architecture decision records

One file per decision that would otherwise get re-argued every few months:
what the situation was, what was chosen, and what that costs.

These were written in November 2026, after the fact, from the rules and the
modelling decisions that had accumulated in `CLAUDE.md`. The decisions are
older than the files; the dates below are when each one was taken, where that
is known.

| # | Decision |
| --- | --- |
| [0001](0001-money-as-a-value-object.md) | Money is a value object over decimal.js, never a `number` |
| [0002](0002-rls-instead-of-application-filtering.md) | Tenant isolation in Postgres with RLS, not a `where` in the application |
| [0003](0003-trpc-instead-of-rest.md) | tRPC instead of REST |
| [0004](0004-a-pure-domain-package.md) | A domain package with no I/O |
| [0005](0005-hand-written-migrations.md) | Migrations written by hand and idempotent |
| [0006](0006-purchases-in-their-own-table.md) | Purchases in their own table, apart from sales |
| [0007](0007-stock-as-movements.md) | Stock as movements, cost as a weighted average |
| [0008](0008-invoicing-behind-an-interface.md) | Electronic invoicing behind an interface, built later |
| [0009](0009-spanish-identifiers.md) | Identifiers in Spanish |
| [0010](0010-long-running-container.md) | A long-running container, not serverless |
| [0011](0011-a-portable-frontend.md) | A frontend with no platform-specific packages |
| [0012](0012-assistant-reads-through-the-app.md) | The assistant reads through the app's own endpoints |
