# AGENTS.md — Convenciones y dominio

Guía para agentes de IA que trabajen en este repo. Las reglas duras están en `CLAUDE.md` (leerlo primero). Acá va el resumen del dominio y las convenciones de trabajo.

## El producto

ERP SaaS multi-tenant para PyMEs argentinas. Cada tenant es una organización (BetterAuth `organization`). Un mail puede pertenecer a varios tenants (caso real: un contador que atiende varias PyMEs). Registro público desactivado — alta solo por invitación.

**Alcance actual: Fase 1** — módulos Clientes, Proveedores, Stock, Tesorería e Impuestos con carga manual, más comprobantes de venta manuales (sin ARCA). La integración ARCA (Fase 3) y el módulo financiero (Fase 2) vienen después, pero el schema ya se diseña para no bloquearlos.

## Modelo de dominio (resumen)

| Entidad | Clave | Relaciones / derivados |
|---|---|---|
| Cliente | CUIT, condición IVA (RI/Monotributo/Exento/CF) | 1→N facturas, cobranzas, cheques. Derivados: saldo cta. cte., DSO |
| Proveedor | CUIT, condición de pago (días), CBU/alias | 1→N comprobantes de compra. Derivados: saldo a pagar, próximo vencimiento |
| Producto (Stock) | SKU, costo unitario, precio venta, stock actual/mínimo | FK proveedor principal. Derivados: estado (Reponer/OK), valorización, rotación |
| Cuenta (Tesorería) | tipo (Efectivo/CC/CA), moneda (ARS/USD) | Derivado: saldo = Σ movimientos con signo |
| Movimiento | tipo (Ingreso/Egreso), medio de pago, importe | FK cuenta, FK opcional comprobante, FK opcional cheque |
| Cheque en cartera | número, librador (FK cliente o texto), fecha de pago | Estados: En cartera/Depositado/Acreditado/Rechazado/Endosado |
| Impuesto | tipo (IVA/IIBB/Ganancias/Monotributo/Otros), período | Derivados: importe determinado = base × alícuota; estado Pagado/Vencido/Pendiente |
| Comprobante de venta | tipo A/B/C/E, punto de venta, número | FK cliente, N ítems. Estados: borrador→enviada→aprobada\|rechazada |
| Comprobante de compra | FK proveedor, fecha recepción, condición de pago | Alimenta saldo a pagar y proyección de egresos |
| Parámetros | por tenant | umbral mora/DSO, margen objetivo, mínimo operativo |

Reglas transversales:

- El tipo de comprobante permitido (A/B/C) lo determina la condición IVA del cliente.
- Los derivados (saldos, DSO, estados por fecha) **no se persisten**: se calculan al leer, con las fórmulas en `packages/core`.
- Los campos con fecha relativa (estado de impuesto, días para cobro) se calculan contra `hoy` en el momento de la consulta.

## Convenciones de trabajo

- **Slices verticales:** cada módulo de negocio vive en `packages/backend/src/modules/<modulo>/` con su router tRPC, service y tests adentro. El frontend espeja la estructura en `src/features/<modulo>/`.
- **Naming:** código (variables, funciones, tablas) en castellano sin tildes (`facturas`, `saldoCuentaCorriente`); tipos y conceptos técnicos en inglés cuando son genéricos (`Money`, `Result`).
- **Commits en inglés**, siempre.
- **Máquinas de estado:** funciones de transición puras (`attemptTransition(estado, evento, derivados)`), el `pgEnum` de Drizzle es la fuente de verdad, y toda respuesta de API con entidad con estado expone `availableEvents`.
- **Tests:** Vitest. Los de `core` se escriben antes que la implementación. Integración con Testcontainers contra Postgres real.
- Antes de dar por terminado un cambio: `pnpm typecheck && pnpm lint && pnpm test`.

## Skills disponibles

En `.agents/skills/`: `trpc`, `drizzle`, `betterauth`, `shadcn`, `arca`, `dominio-fiscal`. Consultarlas antes de trabajar en el área correspondiente.
