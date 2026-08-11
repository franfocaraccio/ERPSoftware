# Pendientes

Estado real del proyecto, verificado contra el código. Lo que está acá es lo que
falta; lo que no está, está hecho.

Fase 1 y Fase 2 no tienen nada pendiente.

## Descartado

- **Histórico de KPIs y selector dinámico de indicadores.** Decisión de Fran:
  no se hace, el panel se queda con la foto del momento. Si alguna vez se
  retoma, el análisis ya está: caja, cobranzas, saldo a pagar, ventas, compras,
  margen, cheques e impuestos se pueden recalcular a cualquier fecha pasada
  porque los movimientos tienen fecha y apuntan al comprobante que cancelan;
  rotación de stock y ciclo de conversión no, porque `stock_actual` es un valor
  de hoy sin historia (decisión de Fase 1: sin tabla de movimientos de stock).

## Fase 3 — TBD

- **Envío de mails (Resend).** Bloqueado por algo que no es escribir código: la
  API key. El resto está listo y enganchado en
  `packages/backend/src/auth/emails.ts`; sin la key cae a imprimir el mensaje en
  la consola del backend. Mientras siga así, invitaciones y recuperación de
  contraseña no salen de la máquina de desarrollo.
  - Mientras tanto: el link de invitación se puede copiar desde `/equipo` y
    desde `/admin`. El de recuperación **no** se muestra en pantalla a
    propósito —sería entregarle la cuenta a cualquiera que escriba un mail—;
    aparece solo en la consola del backend.
- **`packages/arca` es un stub** (`export {}`): falta WSAA, WSFEv1, CAE, QR, PDF
  y la suite contra homologación. **Bloqueado por decisión de Fran** — es la
  Fase 3 entera y no se arranca todavía.

## Asistente (chatbot)

La **Fase A está hecha**: burbuja abajo a la derecha, panel de chat, y un
asistente que responde sobre cómo usar el sistema a partir de `docs/ayuda`, que
viaja entero en el prompt (19k caracteres) y se cachea porque no cambia nunca.
No tiene acceso a los datos de la empresa y el prompt le exige decirlo en vez de
inventar. Corre sobre OpenAI a través del AI SDK; cambiar de proveedor es
cambiar el import en `modules/asistente/ruta.ts`.

Andando en dev desde el 11 de agosto de 2026, verificado contra la API real:
responde sobre el manual, se niega a inventar datos de la empresa y deriva al
contador cuando le piden criterio impositivo. El cache pega: 4864 de 5260 tokens
de entrada se leen cacheados a partir del segundo mensaje.

- **La burbuja aparece aunque el asistente esté apagado.** El endpoint
  `/api/chat/estado` está hecho para poder esconderla, pero no está enganchado
  en el frontend.
- **Fase B — responder sobre los datos del usuario.** El diseño está decidido:
  herramientas de solo lectura sobre los services que ya existen, ejecutadas con
  el `Actor` que arma el servidor, nunca SQL generado por el modelo y nunca
  aritmética hecha por el modelo (los totales los devuelve `@erp/core`). No se
  fijan preguntas posibles: el modelo razona y elige la herramienta.
- **El tope diario vive en memoria** (`modules/asistente/limite.ts`): se
  reinicia en cada deploy y no se comparte entre instancias. Alcanza con un solo
  contenedor; si el backend escala, hay que moverlo a Postgres.
- **Las conversaciones no se guardan.** Tabla con `tenant_id` y RLS como todo el
  resto. Conviene hacerlo **antes** de la Fase B, no después: lo que la gente
  pregunta es lo que dice qué herramientas hay que construir y qué partes del
  manual están flojas. Sin eso, la lista de herramientas de la Fase B se elige
  adivinando.
- El manual se lee del disco al arrancar: **editar un `.md` exige reiniciar el
  backend**, y el `Dockerfile` tiene que seguir copiando `docs/`.
- Lo que **sí** está cubierto: `schema.ts`, `limite.ts` y `manual.ts` tienen
  tests, y `features/asistente/rutas.test.ts` compara la lista blanca de links
  y el manual contra el árbol de rutas real. Ese último es el que evita que
  agregar una pantalla deje al asistente contestando cosas viejas. Corren con
  `pnpm test`, sin API key y sin base de datos.

## Infraestructura

- El entorno de desarrollo está deployado y andando: Vercel → Railway →
  Supabase `erp-dev`. El detalle completo, con las variables exactas y los
  problemas abiertos, está en `DEPLOY.md`.
- **Dominio propio.** Bloqueado hasta definir el nombre, pero es lo más urgente
  de la lista: **sin él, el login puede no funcionar en iPhone ni en Mac**,
  porque Safari bloquea las cookies de terceros por defecto y hoy el frontend y
  el backend están en dominios sin relación. Todo decidido en `DEPLOY.md`.
- **Entorno `erp-prod`. Bloqueado por decisión de Fran.**
- **Sentry y monitoreo. Bloqueado por decisión de Fran.**
- **Plan de hosting. Bloqueado por decisión de Fran.** El Hobby de Vercel no
  permite uso comercial: antes del primer cliente pago hay que pasar a Pro o
  mudar a Cloudflare Pages, que sí lo permite gratis.
