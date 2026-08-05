# CLAUDE.md — @erp/frontend

Vite SPA — React 19, TanStack Router/Query/Form/Table, cliente tRPC, Tailwind v4. Deploy como estático en Vercel, 100% portable a cualquier CDN.

## Estructura

```
src/
  routes/     árbol de rutas TanStack Router (file-based)
  features/   un directorio por módulo, espejando backend/src/modules
  lib/        cliente tRPC, query client, utilidades
```

## Reglas específicas

- **Prohibido cualquier paquete `@vercel/*`** (Analytics, Blob, etc.). Nada específico del hosting.
- La URL de la API sale de `import.meta.env.VITE_API_URL`. Nunca hardcodeada.
- Estado servidor = TanStack Query vía tRPC. No duplicar datos del servidor en estado local/global.
- Componentes visuales compartidos se importan de `@erp/design-system`; las features no re-crean botones, inputs ni tablas.
- Dinero llega como **string**: se muestra con `Intl.NumberFormat('es-AR')`, se editan strings y se envían strings. Prohibido operar con `number`.
- Acciones sobre entidades con estado: renderizar según `availableEvents` de la respuesta — la UI no conoce la máquina de estados.
- Ningún import de clientes de base de datos ni de `supabase-js`.
- Textos de UI en castellano con tildes. Dark mode con toggle (clase `.dark` + localStorage).
- Del backend solo se importa `import type { AppRouter }` — jamás código de runtime.

Ver skills: `shadcn`, `trpc`.
