# 0012 — The assistant reads through the app's own endpoints

**Status:** accepted

## Context

An assistant over business data is usually built by letting a model write SQL,
or by giving it a dedicated query layer. Both are wrong here. Generated SQL
against a multi-tenant database is one prompt away from a cross-tenant read,
and any dedicated layer is a second implementation of the permission rules
that will drift from the first. A model doing arithmetic on financial figures
is worse: it produces a number that looks right.

## Decision

Each tool calls one of the application's existing **read** procedures through
a tRPC caller built from the asker's session. No SQL, no writes, no arithmetic
by the model — totals and percentages arrive already computed by `@erp/core`.
Results are truncated to a row and character budget before reaching the model,
and internal fields are stripped.

A test compares the tool list against every read procedure in the router, so a
new module cannot become visible to the assistant without someone deciding it
should. Export procedures are deliberately excluded: they leave an entry in
the audit history.

Usage is capped per organization per day.

## Consequences

- The assistant inherits every access rule for free — a read-only link scoped
  to two modules sees exactly those two through the chat.
- A rule that changes in one place changes for the chat too, with no second
  copy to update.
- The assistant can only answer what some screen can already show; a question
  needing an unanticipated aggregation cannot be answered.
- Adding a module means someone has to make an explicit decision, which is the
  point and also friction.
