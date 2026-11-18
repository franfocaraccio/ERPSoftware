# 0001 — Money is a value object over decimal.js, never a `number`

**Status:** accepted

## Context

The system adds, splits and compares amounts all day: VAT by rate, partial
applications of a receipt against invoices, a thirteen-week projection, a
weighted-average cost. IEEE-754 cannot represent `0.1`, so a chain of
arithmetic in JavaScript `number` drifts. In an ERP the drift does not show up
as an exception — it shows up as a reconciliation that is off by a cent, found
weeks later by a person who now distrusts the whole system.

Two currencies coexist: ARS and USD. Adding one to the other is always a bug,
but with bare numbers it is a bug that produces a plausible total.

## Decision

Every amount is a `Money` value object wrapping a `decimal.js` `Decimal` and
carrying its currency. It is immutable; every operation returns a new one.
Mixing currencies throws `MonedaDistintaError`. The only way in from outside
is `Money.desdeString`, which rejects anything that is not a decimal string.

Amounts travel as strings: `numeric` in Postgres, string over tRPC, `Money` in
services and in `@erp/core`. `parseFloat` and `Number()` on an amount are
forbidden.

## Consequences

- An amount cannot silently lose precision, and a cross-currency sum fails
  loudly at the first operation rather than at the total.
- Everything is more verbose: no `a + b`, and every boundary needs an explicit
  conversion.
- `decimal.js` is a runtime dependency of the domain package, and the only
  one.
- The rule has to be enforced by review, because TypeScript cannot stop
  someone from writing `Number(fila.total)`.
