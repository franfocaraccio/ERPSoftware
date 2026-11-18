## What changed, and why

<!-- The why matters more than the what: the diff already says what. -->

## How it was verified

<!-- Which of these ran, and what they said. Say so if one did not. -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Tried in the app, not only in tests

## Rules this touches

<!-- Delete the ones that do not apply. Each links to the record that explains it. -->

- [ ] Money stays `Money`, never a `number` — [ADR 0001](../docs/adr/0001-money-as-a-value-object.md)
- [ ] Every query goes through `withTenant`, and ids from the client through `exigirPropios` — [ADR 0002](../docs/adr/0002-rls-instead-of-application-filtering.md)
- [ ] No financial calculation outside `@erp/core` — [ADR 0004](../docs/adr/0004-a-pure-domain-package.md)
- [ ] New migration written by hand, idempotent, with its journal entry — [ADR 0005](../docs/adr/0005-hand-written-migrations.md)
- [ ] Zod on every new external input
- [ ] Anything that moves a balance, stock or a tax writes to the audit log

## What this leaves open

<!-- Known gaps, follow-ups, anything a reviewer should not assume is handled. -->
