---
description: Corre typecheck, lint y tests de todo el monorepo y reporta el resultado
---

Corré en orden `pnpm typecheck`, `pnpm lint` y `pnpm test` desde la raíz del repo.

- Si algo falla, mostrá el error relevante (no el log completo), diagnosticá la causa y proponé el fix — no lo apliques sin confirmar salvo que sea trivial (formato, import sin usar).
- Si todo pasa, respondé con un resumen de una línea por check.
