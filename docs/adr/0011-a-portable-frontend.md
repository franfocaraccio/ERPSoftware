# 0011 — A frontend with no platform-specific packages

**Status:** accepted

## Context

The frontend is a static SPA deployed on Vercel's free tier, which does not
permit commercial use. The day this has paying customers it has to move — to
Vercel Pro, or to another CDN. A move that requires rewriting code is a move
that gets postponed past the point where it should have happened.

## Decision

No `@vercel/*` package, no platform analytics, no platform blob storage. The
API location comes from `VITE_API_URL` and is never hardcoded. The build
output is plain static files.

## Consequences

- Moving hosts is a build-and-upload, not a migration.
- Some conveniences the platform offers are not used, and the equivalents are
  either built or done without.
- The rule needs enforcing in review, since adding such a package is one
  `pnpm add` that nothing else would catch.
