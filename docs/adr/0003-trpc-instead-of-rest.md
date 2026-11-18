# 0003 — tRPC instead of REST

**Status:** accepted

## Context

One TypeScript monorepo, one frontend, one backend, one team. A REST API
between them means either hand-written client types that drift from the
server, or a code generation step in the build. Both cost more than they
return when there is exactly one consumer and it lives in the same repository.

## Decision

tRPC 11 for everything that is data. The client infers the router's types
directly; there is no schema file and no generated client. Every `.input()`
carries a Zod schema, so the runtime validation and the compile-time type come
from the same declaration.

## Consequences

- Renaming a field or changing a shape breaks the frontend at compile time
  instead of at runtime.
- Permission rules live in middleware composed into procedures
  (`tenantProcedure`, `escrituraProcedure`), applied once rather than per
  handler.
- There is no public HTTP API. A third-party integration would need one built
  on purpose, which is the right trade for now and a real cost if it changes.
- Anything that is not JSON does not fit: file uploads, PDF downloads and the
  assistant's stream are plain Express routes, and each has to re-do the
  session and role check by hand.
