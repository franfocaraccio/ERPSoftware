# 0007 — Stock as movements, cost as a weighted average

**Status:** accepted, 2026-10-12 — replaces an earlier decision

## Context

The first design had `stock_actual` and `costo_unitario` as editable fields on
the product. That makes every number unexplainable: when the figure on screen
disagrees with the shelf, there is no way to find out what happened, because
nothing recorded it. It also makes cost a guess typed by whoever last looked.

## Decision

Stock is derived from a movements table. A confirmed sale subtracts, a credit
note returns, a purchase with items adds, and a manual adjustment is itself a
movement with a reason. Nothing writes the quantity directly.

Unit cost is a weighted average, recalculated on each purchase:

```
(previous stock × previous cost + quantity bought × purchase cost)
/ (previous stock + quantity bought)
```

With no previous stock — or negative, because something was sold that was not
there — there is nothing to weight, and the cost becomes the purchase cost.

## Consequences

- Every quantity can be explained by a list of movements with dates and
  origins.
- Margin uses a cost that follows what was actually paid, rather than a number
  someone typed once.
- The current quantity is a sum, so it needs either an aggregate or a
  maintained running figure; the movements remain the source of truth either
  way.
- Corrections are new movements, never edits, which is more rows and the
  reason the history is worth anything.
