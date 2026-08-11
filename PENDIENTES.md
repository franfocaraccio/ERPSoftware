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

- **Falta la `OPENAI_API_KEY`.** Sin ella el chat queda deshabilitado a
  propósito: la burbuja igual aparece pero la ruta contesta 503. Es lo único que
  separa a la Fase A de estar andando en dev. **La llamada real al modelo no
  está probada todavía** — sí lo está todo lo demás (sesión, validación, tope
  diario, streaming y render).
- **Fase B — responder sobre los datos del usuario.** El diseño está decidido:
  herramientas de solo lectura sobre los services que ya existen, ejecutadas con
  el `Actor` que arma el servidor, nunca SQL generado por el modelo y nunca
  aritmética hecha por el modelo (los totales los devuelve `@erp/core`). No se
  fijan preguntas posibles: el modelo razona y elige la herramienta.
- **El tope diario vive en memoria** (`modules/asistente/limite.ts`): se
  reinicia en cada deploy y no se comparte entre instancias. Alcanza con un solo
  contenedor; si el backend escala, hay que moverlo a Postgres.
- **Las conversaciones no se guardan.** Para mejorar el asistente hay que poder
  leer qué le preguntan. Tabla con `tenant_id` y RLS como todo el resto.
- El manual se lee del disco al arrancar: **editar un `.md` exige reiniciar el
  backend**, y el `Dockerfile` tiene que seguir copiando `docs/`.

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
