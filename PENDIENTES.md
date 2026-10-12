# Pendientes

Estado real del proyecto, verificado contra el código. Lo que está acá es lo que
falta; lo que no está, está hecho.

Fase 1 y Fase 2 no tienen nada pendiente.

## Pedidos de Jesi (11 de octubre de 2026)

Diez puntos revisados contra el código. Tres no eran trabajo sino preguntas con
respuesta, y dos chocan con una decisión ya tomada.

**Hecho:** saldo y próximo vencimiento por cliente, total a cobrar y
concentración de cartera con umbral configurable por empresa; lo mismo del lado
de proveedores (total a pagar y dependencia del proveedor más grande); y el
dólar oficial con compra y venta en el panel.

**Ya estaba resuelto, sin trabajo:**

- *¿El SKU es manual?* Sí: `text` obligatorio con índice único por empresa, sin
  autonumeración. Si se quiere generar, es un pedido nuevo y chico.
- *¿De dónde sale el margen?* De `margenBruto(precioVenta, costoUnitario)` en
  `core`, calculado al leer. Lo importante es que `costo_unitario` es carga
  manual por decisión de Fase 1: el margen vale lo que vale el costo tipeado.
- *¿Quién valida un comprobante aprobado?* Una persona, ya. La máquina de
  estados es `borrador → enviada → aprobada/rechazada` y nada llega a
  `aprobada` solo; además `aprobada` no tiene salida, porque un comprobante con
  CAE es inmutable.

**Pendiente, mediano:**

- **Falta el selector de columnas en cinco tablas.** Está en clientes,
  proveedores y stock, que son las tres que usan TanStack Table y donde el
  problema realmente aparece (ocho y nueve columnas). Las otras cinco
  —movimientos, cheques, comprobantes de venta y de compra, e historial— son
  markup plano: implementarlo ahí significa condicionar cada `<th>` y cada
  `<td>` a mano, con el riesgo de que encabezado y celda se desincronicen. No
  urge: medidas a 1512px en modo compacto, las cinco entran sin scroll.
  - La densidad sí está en las ocho.
  - Conviene mirarlo con Jesi en su pantalla antes de darlo por cerrado: el
    punto era que ella dejara de necesitar el zoom.
  - El `meta.ancha` de `lib/tabla.ts` corta los textos libres con puntos
    suspensivos. Sin eso, una sola descripción larga empuja las columnas de la
    derecha fuera de la pantalla en cualquier densidad. Conviene marcarlo en
    toda columna de texto libre que se agregue.

**Pendiente, grande:**

- **Leer extractos bancarios y comprobantes de pago subidos.** Los dos son OCR,
  y `CLAUDE.md` dice explícitamente "No implementar el módulo de IA (voz/OCR) —
  fuera de alcance". Si se quieren, es una conversación de alcance, no una
  tarea. Aparte: en el extracto lo difícil no es leer el PDF sino **conciliar**
  cada línea contra el movimiento ya cargado.

## Un problema transversal pendiente

- **Las notas de crédito suman en vez de restar** en el DSO, la proyección de
  caja y el gráfico de ventas por mes (`financiero/service.ts`). Como es el
  único mecanismo de corrección de un comprobante con CAE, devolverle plata a un
  cliente hoy le aumenta las ventas. En clientes ya se resta.

## Postergado

- **Mails automáticos de saldos próximos a vencer.** Decisión de Fran del 12 de
  octubre de 2026: se retoma cuando haya dominio propio, no antes. Y es la
  secuencia correcta: un recordatorio de pago mandado desde una dirección que no
  es la de la empresa va a spam o, peor, parece una estafa. Cuando se retome,
  falta pg-boss (no está instalado), la key de Resend, y decidir a quién se le
  manda, cada cuánto y quién lo apaga.

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

- **Fase B — responder sobre los datos del usuario.** El diseño está decidido:
  herramientas de solo lectura sobre los services que ya existen, ejecutadas con
  el `Actor` que arma el servidor, nunca SQL generado por el modelo y nunca
  aritmética hecha por el modelo (los totales los devuelve `@erp/core`). No se
  fijan preguntas posibles: el modelo razona y elige la herramienta.
- **El tope diario vive en memoria** (`modules/asistente/limite.ts`): se
  reinicia en cada deploy y no se comparte entre instancias. Alcanza con un solo
  contenedor; si el backend escala, hay que moverlo a Postgres.
- **Falta decidir la retención de las conversaciones.** Hoy se guardan sin
  vencimiento y contienen texto que escribieron los usuarios. Las tablas tienen
  DELETE para poder purgar, pero no hay nada que lo haga: falta definir cuánto
  se conservan y agregar el job.
- El manual se lee del disco al arrancar: **editar un `.md` exige reiniciar el
  backend**, y el `Dockerfile` tiene que seguir copiando `docs/`.
- Lo que **sí** está cubierto: `schema.ts`, `limite.ts`, `manual.ts` y
  `service.ts` tienen tests, y `features/asistente/rutas.test.ts` compara la
  lista blanca de links y el manual contra el árbol de rutas real. Ese último es
  el que evita que agregar una pantalla deje al asistente contestando cosas
  viejas. Todos corren con `pnpm test` y sin API key.
- Las conversaciones **se guardan** (`asistente_conversaciones` y
  `asistente_mensajes`, con RLS). Para leerlas:
  `psql "$DATABASE_URL_MIGRATIONS" -f packages/backend/scripts/leer-conversaciones.sql`,
  que saca las últimas preguntas, las que el asistente no supo contestar y el
  consumo de tokens por día. **No hay pantalla para verlas**: si mirarlas por
  SQL se vuelve incómodo, ahí conviene hacerla.

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
