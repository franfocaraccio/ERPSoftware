---
name: shadcn
description: Convenciones de UI — shadcn/ui sobre Base UI (no Radix), Tailwind v4, tema con dark mode por botón, estética minimalista.
---

# UI en este repo

## Base técnica

- shadcn/ui en su variante sobre **Base UI** (`@base-ui-components/react`) — NO Radix. Al agregar componentes, verificar que la plantilla/registry usada sea la de Base UI.
- Tailwind **v4**: configuración CSS-first con `@theme` en CSS; no hay `tailwind.config.js` salvo necesidad real.
- Los componentes compartidos viven en `packages/design-system`; el frontend no copia componentes propios por feature si ya existen ahí.
- Gráficos con Recharts, envueltos en componentes del design system (nunca Recharts crudo en las features).

## Tema y dark mode

- **Dark mode configurable desde un botón** en la UI (requisito del dueño del producto). Estrategia de clase (`.dark` en `<html>`), persistida en `localStorage`, con fallback a `prefers-color-scheme`.
- Tokens de color como variables CSS en `@theme` — los componentes consumen tokens semánticos (`--background`, `--foreground`, `--primary`, ...), nunca colores hardcodeados.
- Estética: **moderna y minimalista**. Referencias aprobadas: https://21st.dev/community/components y https://www.cult-ui.com/. Para trabajo de diseño usar el skill `ui-ux-pro-max` si está disponible.

## Convenciones

- Textos de UI en castellano (con tildes — esto es contenido, no código).
- Formularios con TanStack Form + schemas Zod compartidos con el backend cuando aplique.
- Grillas con TanStack Table sobre los componentes de tabla del design system.
- Dinero se muestra formateado con `Intl.NumberFormat('es-AR', { style: 'currency' })` a partir del **string** que llega por tRPC — jamás `parseFloat` para operar.
- Estados de entidades → `availableEvents` del backend decide qué acciones se renderizan; la UI no re-implementa la máquina de estados.
- Accesibilidad: los componentes Base UI ya traen semántica; no romperla con `div` clickeables.

## Precaución

No inventar props de Base UI ni utilidades de Tailwind v4. Ante duda, verificar en https://base-ui.com/docs y https://tailwindcss.com/docs.
