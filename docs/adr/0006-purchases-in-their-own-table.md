# 0006 — Purchases in their own table, apart from sales

**Status:** accepted

## Context

A sales document and a purchase document look similar on screen and are not
the same thing. A sales document is *issued* by us: it needs gapless
numbering, a letter derived from both parties' tax categories, a state
machine, and eventually a CAE from the tax authority that freezes it forever.
A purchase document is *received*: its number is whatever the supplier
printed and is stored as the single string the paper shows, it has a reception
date as well as an issue date, it can be corrected, and it carries a scanned
attachment and an expense category.

One shared table would mean a growing set of nullable columns and conditionals
asking which kind it is — including inside the numbering and the emission
logic, which is the last place for an `if`.

## Decision

`comprobantes_compra` is its own table, separate from `comprobantes_venta`,
with its own module and its own routes.

## Consequences

- The emission path only ever deals with documents it is allowed to issue.
- Anything genuinely common — VAT breakdown by rate, totals — lives in
  `@erp/core` and is shared as functions rather than as a table.
- Reports that span both have to union them explicitly.
- Two similar UIs to keep consistent, which has already drifted once.
