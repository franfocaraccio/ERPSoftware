# 0004 — A domain package with no I/O

**Status:** accepted

## Context

The rules worth getting right in this system are calculations: ageing, VAT
position, the letter a document must carry, a thirteen-week projection,
weighted-average cost, whether a state transition is legal. When those live
inside a router or a React component, testing one means standing up a
database and a session, so in practice they get tested through the UI, or not
at all.

## Decision

`@erp/core` holds them, and imports nothing but `decimal.js` — no database
client, no HTTP, no framework, no ambient clock. Functions are pure: dates and
"today" arrive as arguments. A formula appearing in a router, a query or a
component is a bug in placement, not a style preference.

Its tests are written before the implementation.

## Consequences

- A rule is tested as arithmetic: inputs in, result out, no fixtures and no
  database.
- Services get thinner — they fetch, convert to `Money`, call `core`, persist.
- Some data has to be assembled by the caller and passed in whole, which is
  occasionally more code than a query that joins and sums in SQL.
- Anything genuinely better done by the database (aggregations over large
  tables) sits uneasily with this rule and has to be argued case by case.
