---
name: drizzle
description: Schema Drizzle, migraciones y el patrón SET LOCAL app.tenant_id con RLS — cómo se escribe y consulta la base en este repo.
---

# Drizzle + RLS en este repo

## Convenciones de schema

- Schema en `packages/backend/src/db/schema/`, un archivo por módulo.
- Tablas y columnas en `snake_case` castellano sin tildes (`clientes`, `saldo_cuenta_corriente` — aunque los saldos derivados NO se persisten).
- **Toda tabla de negocio tiene `tenant_id`** (FK a la organización de BetterAuth) + índice que empieza por `tenant_id`.
- PKs: `uuid` con default generado en DB.
- Dinero: `numeric(14, 2)` (o la precisión que pida el caso) — **nunca** `real`/`double`. En TypeScript llega como `string` y se convierte a `Money` en el dominio.
- Enums de estado: `pgEnum` — es la fuente de verdad de las máquinas de estado. Timestamps `created_at`/`updated_at` con `timestamptz`.

## El patrón SET LOCAL (regla dura)

Ninguna query toca la base fuera de este wrapper:

```ts
// packages/backend/src/db/tenant-db.ts (concepto)
withTenant(tenantId, async (tx) => {
  // dentro de la transacción, primero:
  // SET LOCAL app.tenant_id = '<tenantId>'  (via sql parametrizado)
  // después las queries Drizzle sobre tx
})
```

- `SET LOCAL` vive solo dentro de la transacción → al terminar, la conexión vuelve limpia al pool.
- Las políticas RLS leen `current_setting('app.tenant_id')::uuid`.
- El rol de la aplicación NO es owner de las tablas y NO tiene `BYPASSRLS`. Las migraciones corren con otro rol.
- pg-boss usa el mismo wrapper: cada job recibe `tenantId` en su payload y abre su transacción tenantizada.
- Con Supabase: la conexión de la app requiere **session mode** (puerto 5432 directo o pooler en session mode) porque los advisory locks fiscales y `SET LOCAL` no sobreviven al transaction pooling.

## Políticas RLS

Cada tabla de negocio:

```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <tabla>
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

Las políticas van en las migraciones SQL de Drizzle (custom migrations), no a mano en producción.

## Migraciones

- `drizzle-kit generate` para el SQL a partir del schema; revisar el SQL generado antes de aplicar.
- Las políticas RLS y los triggers se agregan como migraciones custom versionadas junto a las generadas.
- Nunca `drizzle-kit push` contra producción.

## Precaución

No inventar la API de Drizzle (relations, `sql` template, transacciones anidadas). Ante duda, verificar en https://orm.drizzle.team/docs antes de escribir código.
