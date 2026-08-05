# CLAUDE.md — ERP PyME

ERP SaaS multi-tenant para PyMEs argentinas con facturación electrónica contra ARCA (ex AFIP).
Monorepo pnpm + Turborepo. Documentación y UI en castellano; **mensajes de commit siempre en inglés**.

## Comandos

```bash
pnpm typecheck      # turbo run typecheck en todos los packages
pnpm lint           # biome check .
pnpm lint:fix       # biome check --write .
pnpm test           # turbo run test
docker compose up -d  # Postgres 17 local (erp/erp@localhost:5432/erp)
```

## Estructura

- `packages/core` — dominio puro: money, cashflow, kpis, invoicing, tax. Sin DB, sin HTTP, sin I/O.
- `packages/backend` — Express 5 + tRPC 11 + Drizzle + BetterAuth + pg-boss. Slices verticales en `src/modules/`.
- `packages/frontend` — Vite SPA, React 19, TanStack Router/Query/Form/Table.
- `packages/design-system` — shadcn/ui sobre Base UI + Tailwind v4.
- `packages/arca` — WSAA/WSFEv1 detrás de `IFacturacionElectronica`.

## Reglas duras (innegociables)

### Dinero

- **NUNCA usar `number` para valores monetarios.** Siempre `decimal.js` a través del value object `Money`.
- `numeric` en Postgres → **string** en el borde de tRPC → `Money` en el dominio.
- `Money` incluye la moneda. ARS y USD conviven en el sistema.

### Aislamiento multi-tenant

- **TODA query pasa por el wrapper de transacción con `SET LOCAL app.tenant_id`.** Sin excepciones.
- Las políticas RLS de Postgres leen `current_setting('app.tenant_id')`.
- El `tenantId` sale **siempre** de la sesión del servidor (`activeOrganizationId` de BetterAuth), **nunca** de un parámetro del cliente.
- Los jobs de pg-boss también declaran su tenant con el mismo mecanismo.
- Nunca conectarse con un rol que bypasee RLS fuera de las migraciones.

### Dominio

- **Ningún cálculo financiero fuera de `packages/core`.** Si aparece una fórmula en un router, un componente o una query, está mal ubicada.
- `packages/core` no importa nada de DB, HTTP ni frameworks. Solo funciones puras.
- Tests de `core` con Vitest, **escritos antes** que la implementación.

### Bordes

- Todo input externo (request tRPC, respuesta de ARCA, webhook) pasa por **Zod** antes de tocar el dominio.
- Ningún componente de UI importa el cliente de base de datos.

### Fiscal

- **Un comprobante con CAE es inmutable.** Correcciones solo por nota de crédito o débito.
- Audit log de toda operación que impacte saldos, stock o impuestos.
- **Numeración sin huecos:** `pg_advisory_xact_lock` por `(tenant_id, punto_venta)` + consulta del último comprobante autorizado en ARCA antes de emitir. Requiere conexión en **session mode**, no transaction mode.
- **Idempotencia obligatoria en la emisión.** Un reintento no puede duplicar un comprobante fiscal.

### Frontend

- **Prohibido cualquier paquete específico de Vercel** (`@vercel/*`, Vercel Analytics, Vercel Blob). El frontend debe ser 100% portable a cualquier CDN estático.
- La URL de la API va en `VITE_API_URL`, nunca hardcodeada.

### Versiones

React 19, Tailwind v4, shadcn sobre **Base UI (no Radix)**, TanStack Router (no React Router), Express 5, TypeScript 7. No usar patrones de generaciones anteriores.

## Decisiones de modelado ya tomadas (no re-preguntar)

1. Compras en tabla propia (`comprobantes_compra`), separada de facturación de ventas.
2. Fase 1 incluye comprobantes de venta con carga manual (sin ARCA/CAE); Fase 3 suma la emisión electrónica sobre el mismo schema.
3. `stock_actual` es editable a mano en Fase 1 (sin tabla de movimientos de stock).
4. `costo_unitario` es carga manual en Fase 1 (sin política última compra / promedio ponderado).
5. Impuestos: un único `importe_pagado` por registro (sin N pagos por obligación).
6. Monedas: un movimiento hereda la moneda de su cuenta; cheques e impuestos siempre ARS.
7. Tabla `parametros` por tenant desde Fase 1 (umbral de mora/DSO, margen objetivo, mínimo operativo).
8. Cheque "Endosado" es solo un estado descriptivo (no registra destinatario ni genera egreso).

## Qué NO hacer

- No usar Airtable, n8n ni middleware externo (la especificación original los menciona; nosotros no los usamos).
- No usar Next.js, Server Actions ni SSR.
- No usar `supabase-js` desde el frontend. Supabase es Postgres + Storage accedido solo desde el backend.
- No usar `@afipsdk/afip.js` (requiere access_token de un servicio pago).
- No implementar el módulo de IA (voz/OCR) — fuera de alcance.
- No inventar APIs de librerías: si no estás seguro de una firma de BetterAuth, tRPC, Drizzle o la librería de ARCA, decirlo y verificarla en la documentación antes de escribir código.

Ver `AGENTS.md` para el resumen del dominio y `.agents/skills/` para patrones por tecnología.
