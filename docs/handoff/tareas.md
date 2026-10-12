# Handoff — tareas pendientes

Escrito el 12 de octubre de 2026, verificado contra el código de `main` en el
commit `c34689d`.

Este documento existe para que una sesión nueva pueda agarrar **una** de estas
tareas sin leer las otras y sin reconstruir el contexto. Cada sección es
autocontenida: objetivo, estado real, archivos, decisiones ya tomadas,
restricciones y cómo verificar.

Las tareas son cuatro, y el orden importa:

| # | Tarea | Depende de | Tamaño |
|---|---|---|---|
| 1 | Las notas de crédito suman en vez de restar | nada | chica, cerrada |
| 2 | Adjuntar archivos (Supabase Storage) | nada | mediana |
| 3 | Leer extractos bancarios y conciliar | tarea 2 | grande |
| 4 | Leer comprobantes de pago | tarea 2 | mediana, con una pregunta abierta |

Las tareas 3 y 4 son el "OCR". **No se pueden empezar sin la tarea 2**: hoy no
existe ninguna forma de subir un archivo a la aplicación (ver "Estado real" en
esa sección). Quien arranque por el OCR sin leer eso lo va a descubrir al tercer
día.

---

## Reglas que valen para las cuatro tareas

Son las de `CLAUDE.md`, repetidas acá sólo donde estas tareas las tocan de
cerca. Ante una contradicción, manda `CLAUDE.md`.

- **Dinero: nunca `number`.** Columna `numeric` → `string` en el borde de tRPC →
  `Money` (`@erp/core/money`) en el dominio. Prohibido `Number()` o
  `parseFloat()` sobre un importe. Cuidado con `Number("")`, que da `0` sin
  avisar.
- **Ningún cálculo financiero fuera de `packages/core`.** El SQL agrega, `core`
  calcula. Si aparece una fórmula en un service, un router o un componente, está
  mal ubicada.
- **Toda query dentro de `withTenant(tenantId, ...)`**, y el `tenantId` sale
  siempre de la sesión del servidor, nunca de un input del cliente.
- **Todo input externo pasa por Zod.** Para las tareas 3 y 4 esto incluye
  explícitamente **la respuesta del modelo de OCR**: es texto de una API ajena,
  no un objeto de confianza.
- **Un comprobante con CAE es inmutable.** Correcciones solo por nota de crédito
  o débito. Esto condiciona el diseño de la tarea 4 y es la causa raíz de la
  tarea 1.
- **Audit log** de toda operación que impacte saldos, stock o impuestos:
  `auditar()` en `packages/backend/src/db/auditar.ts`.
- **Mensajes de commit en inglés.** Documentación y UI en castellano.

### Cómo se verifica cualquier cambio

```bash
docker compose up -d     # Postgres 17 local; los tests de backend lo necesitan
pnpm lint                # biome
pnpm typecheck
pnpm test
```

Mirar el **código de salida**, no las últimas líneas de la salida: `pnpm lint`
imprime cosas parecidas cuando pasa y cuando falla, y ya nos comimos un CI roto
por leerlo con `tail`.

Los tests de services corren **contra Postgres real**, no contra mocks de
Drizzle. El aislamiento entre tests lo da RLS: cada uno crea su organización con
`crearTenantDePrueba()` (`packages/backend/src/test/tenant.ts`).

### Migraciones

Las migraciones de este repo están **escritas a mano**. `drizzle-kit generate`
no sirve: los snapshots de `meta/` se desincronizaron del historial y la
generación reproduce migraciones ya aplicadas (pasó con la 0013). El
procedimiento es:

1. Escribir el `.sql` a mano en `packages/backend/drizzle/`, numerado a
   continuación del último (hoy `0013_umbral_concentracion.sql`).
2. Agregar la entrada a mano en `packages/backend/drizzle/meta/_journal.json`
   (`idx`, `version: "7"`, `when`, `tag` igual al nombre del archivo sin `.sql`).
3. Usar `ADD COLUMN IF NOT EXISTS` y equivalentes: la migración puede correr
   sobre una base que ya tiene el cambio.
4. `pnpm --filter @erp/backend db:migrate` corre con `DATABASE_URL_MIGRATIONS`
   (rol `erp`, que bypasea RLS). La aplicación usa `DATABASE_URL` (rol
   `erp_app`, con RLS). No mezclar.

### Si la tarea toca la UI

- Actualizar el manual en `docs/ayuda/*.md`. No es cosmético: el asistente
  responde **sólo** a partir de esos archivos, y los lee del disco al arrancar,
  así que editar un `.md` exige reiniciar el backend.
- `packages/frontend/src/features/asistente/rutas.test.ts` compara la lista
  blanca de links del manual contra el árbol de rutas real. Si agregás una
  pantalla y no la declarás, ese test falla a propósito.

---

## Tarea 1 — Las notas de crédito suman en vez de restar

### Objetivo

Que una nota de crédito **reste** en el panel financiero, como ya resta en la
pantalla de clientes.

### Por qué importa

La nota de crédito es el **único** mecanismo para corregir un comprobante con
CAE. Hoy, devolverle plata a un cliente le **aumenta** las ventas del mes, le
baja el DSO y le mete un cobro fantasma en la proyección de caja. Y los números
se ven perfectamente normales: nadie lo va a reportar.

### Estado real, verificado

`packages/backend/src/modules/financiero/service.ts` **nunca mira
`comprobantesVenta.clase`**. Son tres lugares:

| Líneas | Qué es | A qué llega |
|---|---|---|
| 98–103 | `ventas.totalPeriodo` y `ventas.totalGeneral` | `porCobrar` (112), `dso` (176), `liquidezCorriente` (175), `margenBrutoPorcentual` (180) |
| 273–278 | `cobrosFacturas` | proyección de caja (295) |
| 310–317 | `ventasPorMes` | gráfico de evolución, `features/panel/graficos.tsx` |

**Las compras no están afectadas.** `comprobantes_compra` no tiene columna
`clase` (ver `packages/backend/src/db/schema/compras.ts`): una compra no puede
ser nota de crédito, así que el DPO y la proyección de pagos no tienen este
problema. No "arreglarlo" ahí.

### Archivos

- `packages/backend/src/modules/financiero/service.ts` — el único archivo a
  cambiar.
- `packages/backend/src/modules/clientes/service.ts:82–126` — **el patrón a
  copiar**, con el comentario que explica por qué. Es esto:

  ```sql
  sum(
    case when clase = 'nota_credito'
      then -total
      else total
    end
  )
  ```

- `packages/backend/src/db/schema/facturacion.ts:18–22` — el enum:
  `factura | nota_credito | nota_debito`.
- `packages/core/src/kpis/kpis.ts` — `dso`, `dpo`, `margenBrutoPorcentual`. **No
  hace falta tocarlos**: reciben `Money` ya agregado.
- `packages/core/src/cashflow/proyeccion.ts:70` — `proyectarCaja`.

### Decisiones ya tomadas

- **La nota de crédito resta; la nota de débito suma**, igual que una factura.
  Una nota de débito agrega deuda, no la cancela.
- **El signo se resuelve en SQL, al agregar.** La resta que define un saldo vive
  en `core`; invertir el signo de una fila según su clase es parte de la
  agregación, no una fórmula financiera. Es lo que ya hace clientes.
- **En la proyección de caja, la nota de crédito se niega, no se excluye.** Si
  se excluyera, la proyección mostraría que se cobra la factura completa. Efecto
  colateral aceptado: una semana puede quedar con `cobros` negativo y el gráfico
  de Recharts va a dibujar la barra para abajo
  (`features/panel/graficos.tsx:197` hace `Number(f.cobros)`). Es raro de ver,
  pero es cierto, y es preferible a un cobro que no va a entrar.

### Dos cosas que están mal en el mismo archivo y NO son parte de esta tarea

Dejarlas anotadas y seguir. Mezclarlas vuelve el diff imposible de verificar,
porque mueven todos los KPIs a la vez.

1. **No filtra por estado.** Las consultas de `financiero` cuentan comprobantes
   en `borrador`. Clientes usa `ESTADOS_QUE_DEBEN = ["enviada", "aprobada"]`
   (`clientes/service.ts:49`). Un presupuesto a medio tipear hoy entra en el
   DSO.
2. **No filtra por moneda.** Las líneas 100–101 suman pesos y dólares en el
   mismo total y después lo tratan como ARS. Es el mismo bug que ya se corrigió
   en proveedores.

### Cómo verificar que quedó bien

**No hay ni un test en `modules/financiero/`.** Parte de la tarea es crear el
primero: `packages/backend/src/modules/financiero/service.test.ts`.

El andamio ya existe y conviene copiarlo de
`packages/backend/src/modules/clientes/saldos.test.ts:1–60`, que tiene todo lo
necesario: `crearTenantDePrueba()`, un helper `fila()` que arma un comprobante
con `clase` y `estado` opcionales, y un `enDias(n)` que calcula fechas relativas
a hoy sin pasar por UTC.

Sobre `enDias`: **usarlo siempre, nunca una fecha fija.** Ya se rompió el CI
porque un test tenía hardcodeado `2026-08-01` y el día llegó.

Casos que hay que cubrir:

- Factura de 100 y nota de crédito de 30 → `ventasPorMes` del mes devuelve
  `70`, no `130`.
- Una nota de **débito** de 30 sobre lo mismo → `130`. Si este test no está,
  alguien va a "arreglar" el bug negando las tres clases.
- `porCobrar` y el DSO bajan al emitir la nota de crédito.
- En la proyección, la nota de crédito reduce los `cobros` de la semana de su
  vencimiento (emisión + `condicionVentaDias`), no de la semana de hoy.
- Un tenant cuyo único comprobante es una nota de crédito: dejar escrito en el
  test qué se espera (total negativo) para que sea una decisión y no una
  sorpresa.

**Probar cada test rompiendo el código a propósito** antes de darlo por bueno:
cambiar el `-total` por `total` y confirmar que el test falla. Un test que pasa
con el bug puesto no sirve.

A ojo, en el navegador: `/panel`, con una nota de crédito cargada desde
`/comprobantes`. El gráfico "Ventas por mes" tiene que bajar.

---

## Tarea 2 — Adjuntar archivos

### Objetivo

Poder subir un archivo, guardarlo, y volver a bajarlo. Sin leerlo todavía.

Es el prerrequisito de las tareas 3 y 4, y conviene hacerla y cerrarla sola:
tiene su propio riesgo —el aislamiento entre empresas— y no tiene nada que ver
con el OCR.

### Estado real, verificado

**No existe nada.** Esto es lo que hay:

- Dos columnas que apuntan a un archivo, **y ningún código que las escriba o
  las lea** (verificado con grep sobre todo el repo):
  - `comprobantes_compra.adjunto_path` — "comprobante escaneado en Supabase
    Storage" (`db/schema/compras.ts:27`)
  - `comprobantes_venta.pdf_path` (`db/schema/facturacion.ts:63`)
- `packages/backend/package.json` **no tiene** `@supabase/supabase-js`, ni
  `multer`, ni ningún cliente de storage.
- No hay ninguna ruta de upload.

Lo que sí hay y sirve de precedente: `modules/asistente/ruta.ts` es un **Router
de Express montado al lado de tRPC**, porque streamear una respuesta no entra en
tRPC. Un upload multipart tampoco. Ese es el patrón a seguir.

### Decisiones ya tomadas

- **Supabase Storage, accedido sólo desde el backend con la service key.** El
  frontend jamás ve esa key (`packages/backend/CLAUDE.md`).
- **Nada de `@vercel/blob`** ni ningún paquete `@vercel/*`: el frontend tiene
  que seguir siendo portable a cualquier CDN estático (`CLAUDE.md`).
- **El archivo pasa por el backend**, al menos al principio: una ruta Express
  multipart. Los volúmenes son chicos y así la service key no sale del servidor
  y se puede validar el archivo antes de guardarlo. La alternativa —pedirle a
  Storage una URL de subida firmada y que el browser suba directo— ahorra
  tráfico en Railway y vale la pena **después**, cuando se sepa el volumen real.

### Lo que hay que resolver con cuidado

**El storage de objetos no tiene RLS.** Toda la seguridad multi-tenant de este
proyecto descansa en `SET LOCAL app.tenant_id` y las políticas de Postgres, y en
Storage eso no existe. Dos consecuencias, las dos obligatorias:

1. El path del objeto empieza con el `tenantId` de la sesión.
2. La ruta de descarga **verifica que el objeto pedido pertenezca al tenant de
   la sesión** antes de devolverlo. No alcanza con que el path sea difícil de
   adivinar: un uuid filtrado en un log alcanzaría para leer la factura de otra
   empresa.

Y lo demás que no se puede saltear:

- **Nunca confiar en el nombre del archivo que manda el cliente.** Guardar por
  uuid y conservar el nombre original como un dato, no como una ruta. Un
  `../../` en el nombre es el ataque de manual.
- **Tope de tamaño y de tipo**, rechazando por lo que el archivo *es* y no por
  su extensión.
- Zod en el borde, como todo lo demás.

### Cómo verificar que quedó bien

- Tests del service contra Postgres real, con dos tenants creados por
  `crearTenantDePrueba()`: **el tenant B pide el path del tenant A y tiene que
  recibir un error, no el archivo.** Ese es el test que importa; si falta, la
  tarea no está hecha.
- Subir, recargar la página, bajar el mismo archivo y comparar bytes.
- Probar un archivo que pase el tope de tamaño y uno con un tipo no permitido.
- `pnpm lint && pnpm typecheck && pnpm test` con código de salida 0.

---

## Tarea 3 — Leer extractos bancarios y conciliar

### Objetivo

Que en Tesorería se pueda subir el extracto del banco y que el sistema
**proponga** los movimientos, para que una persona los confirme.

### Antes de escribir una línea: esto cambió de alcance

`CLAUDE.md` decía "No implementar el módulo de IA (voz/OCR) — fuera de alcance".
**Fran lo habilitó el 12 de octubre de 2026** para la parte de OCR; la voz sigue
afuera. La línea de `CLAUDE.md` ya está actualizada apuntando a este documento.

### La parte difícil no es leer el PDF

Leer el archivo es la mitad fácil. Lo difícil es **conciliar**: casar cada línea
del banco contra el movimiento que ya está cargado en el sistema. Los casos que
aparecen en la primera semana de uso real:

- Un depósito que paga tres facturas.
- Una transferencia que llega por menos plata, porque el banco cobró comisión.
- Un débito que nadie cargó nunca.
- El mismo movimiento cargado a mano ayer y ahora leído del extracto.

**Un OCR que inserta movimientos sin conciliar no ahorra trabajo: duplica los
movimientos**, y como el saldo de cada cuenta es derivado (`Σ movimientos`),
ensucia la caja, la liquidez, el DSO y la proyección de una sola vez.

### Empezar por acá, y puede que no haga falta OCR

**Casi todos los bancos argentinos exportan el resumen en CSV o Excel.** Leer un
CSV es determinístico, gratis y no se equivoca. Conviene soportar eso primero y
dejar el PDF —que sí necesita un modelo— para los bancos que no den otra cosa.
Decidir esto con los extractos reales de Fran y Jesi en la mano, no en
abstracto.

### Estado real, verificado

- **`movimientos.conciliado` ya existe**: `boolean`, default `false`
  (`db/schema/tesoreria.ts`). Nada lo usa todavía: el formulario del frontend lo
  manda hardcodeado en `false` (`features/tesoreria/movimientos.tsx:104`) y
  ninguna consulta lo lee. Ese flag es el gancho natural de esta tarea.
- `movimientos` ya tiene `comprobanteVentaId`, `comprobanteCompraId`,
  `clienteId`, `proveedorId` y `chequeId`: la trazabilidad cobro–factura ya está
  modelada, no hay que inventarla.
- Hay un `check` en la tabla: `importe > 0`. El signo lo da `tipo`
  (`ingreso`/`egreso`), **no** el signo del importe. Un extracto trae importes
  negativos: hay que traducirlos, no copiarlos.
- Un movimiento **hereda la moneda de su cuenta** (decisión de modelado 6): el
  extracto se sube contra una cuenta, y de ahí sale la moneda.
- El AI SDK ya está instalado y configurado (`ai`, `@ai-sdk/openai`), con el
  proveedor elegido en un solo lugar: `modules/asistente/ruta.ts`. **No hace
  falta una dependencia nueva** para la parte de modelo.

### Archivos

- `packages/backend/src/modules/tesoreria/service.ts`, `schema.ts`, `router.ts`
- `packages/backend/src/db/schema/tesoreria.ts`
- `packages/frontend/src/features/tesoreria/movimientos.tsx`
- `docs/ayuda/05-tesoreria.md` — el manual, obligatorio si cambia la pantalla
- Precedentes a leer antes de empezar: `modules/asistente/ruta.ts` (ruta Express
  + proveedor de modelo) y `modules/asistente/limite.ts` (tope de consumo)

### Decisiones ya tomadas

- **Nunca se inserta un movimiento automáticamente.** El flujo termina siempre
  en una pantalla de propuestas que una persona confirma línea por línea. Es la
  misma razón que la tarea 4: lo que entra solo, se corrige a mano después.
- **La salida del modelo pasa por Zod** antes de tocar el dominio. Es una
  respuesta de una API externa, con el agravante de que es generada: puede venir
  bien formada y con los números inventados.
- **La aritmética la hace `core`.** El modelo extrae texto; no suma, no
  convierte y no decide si un importe cierra.
- **Tope de consumo desde el primer día**, por empresa y por día, siguiendo
  `modules/asistente/limite.ts`. Un endpoint que llama a un modelo es la única
  ruta de la aplicación donde un request cuesta plata de verdad. Ese contador
  vive en memoria y se pierde en cada deploy: alcanza con un contenedor, y está
  anotado que si el backend escala hay que moverlo a Postgres.
- **Audit log** de cada movimiento creado por esta vía, con la marca de que vino
  de un extracto y de quién lo confirmó.

### Preguntas que hay que contestar antes de diseñar la conciliación

Con extractos reales en la mano:

- ¿Qué tolerancia de fecha se acepta para considerar que dos movimientos son el
  mismo? ¿Y de importe, por las comisiones?
- ¿Se permite casar un depósito contra varias facturas (1:N)?
- ¿Qué pasa con una línea del extracto que no casa con nada: se propone un
  movimiento nuevo, o se deja sin conciliar?
- ¿Se puede subir dos veces el mismo extracto? (La respuesta tiene que ser sí,
  sin duplicar nada.)

### Cómo verificar que quedó bien

- Tests de la lectura del archivo con **extractos reales anonimizados** como
  fixtures, no con un CSV de juguete.
- Tests de la conciliación como funciones puras: cada caso de arriba es un test.
  Si el matching vive en `core`, mejor; si depende de consultar la base, va en
  el service con Postgres real.
- **El test que no puede faltar: subir el mismo extracto dos veces no crea
  movimientos duplicados.**
- Mutation testing sobre el matcher: aflojar la tolerancia de importe y
  confirmar que algún test se cae.
- A ojo: subir el extracto de un mes real y contar cuántas líneas propone bien.
  Medir eso antes de darlo por cerrado.

---

## Tarea 4 — Leer comprobantes de pago

### Objetivo

Que no haya que tipear a mano un comprobante que llegó por mail o por WhatsApp.

### Antes de escribir una línea: hay que resolver una ambigüedad

El pedido de Jesi dice, bajo el título "Comprobantes": *"acá el cliente nos
envía un comprobante de pago y hay que cargarlo a mano? O se puede subir y que
se lea?"*.

Eso se puede leer de tres maneras, y **cada una produce un registro distinto en
una tabla distinta**:

1. **Un cliente manda el comprobante de una transferencia** → lo que hay que
   crear es un `movimiento` de tipo `ingreso` vinculado a ese cliente. Es la
   lectura literal de sus palabras.
2. **Un proveedor manda una factura** → lo que hay que crear es una fila en
   `comprobantes_compra`, que es la pestaña "Compras" de esa misma pantalla y la
   única tabla con una columna de adjunto ya prevista (`adjunto_path`).
3. **Adjuntar el archivo como respaldo** de un comprobante de venta que ya
   existe, sin crear nada.

**Preguntarle a Jesi antes de implementar.** Si hay que apostar: la 1 es lo que
dicen sus palabras y la 2 es lo que más trabajo manual ahorra. Son dos tareas
distintas, no dos variantes de la misma.

### La otra mitad de su pregunta ya está resuelta

Jesi también preguntó: *"¿Quién valida? Debe existir una validación humana para
estado aprobada"*. **Eso ya funciona así y no hay nada que hacer**, conviene
saberlo para no construirlo de nuevo:

- La máquina de estados es `borrador → enviada → aprobada/rechazada`, y vive en
  `packages/core/src/invoicing/estados.ts` como función pura.
- Las transiciones pasan sólo por ahí: `transicionarVenta()` en
  `modules/comprobantes/service.ts:273` llama a `attemptTransition()`. Nada
  llega a `aprobada` por su cuenta.
- `aprobada` **no tiene salida**, porque un comprobante con CAE es inmutable.
- El service devuelve `availableEvents` para que el frontend dibuje las acciones
  sin conocer la máquina de estados.

### Estado real, verificado

- `comprobantes_compra.adjunto_path` ya existe y **nada lo escribe** (tarea 2).
- `modules/comprobantes/` tiene `router.ts`, `schema.ts`, `service.ts` y
  `service.test.ts`. La creación y la edición ya están, con la regla de que sólo
  `borrador` es editable (`service.ts:215`).
- El frontend tiene la pantalla partida en dos pestañas:
  `features/comprobantes/ventas.tsx` y `features/comprobantes/compras.tsx`, con
  `formulario.tsx` compartido.
- El AI SDK ya está instalado; no hace falta dependencia nueva.

### Archivos

- `packages/backend/src/modules/comprobantes/` (lecturas 2 y 3) o
  `packages/backend/src/modules/tesoreria/` (lectura 1)
- `packages/frontend/src/features/comprobantes/formulario.tsx`
- `docs/ayuda/04-comprobantes.md`
- `packages/core/src/invoicing/estados.ts` — leer, no tocar

### Decisiones ya tomadas

- **El OCR nunca crea el registro final. Precarga un formulario que una persona
  confirma.** El motivo no es desconfianza en el modelo: es que un comprobante
  que llega a `aprobada` con un dato mal leído **sólo se puede corregir con una
  nota de crédito** —es inmutable—, y eso es exactamente el agujero de la tarea
  1. Un campo mal precargado se arregla tipeando encima; un comprobante mal
  emitido queda en el historial fiscal para siempre.
- **La salida del modelo pasa por Zod**, y además se valida contra el dominio:
  un CUIT con `validarCuit` de `core/tax/cuit.ts`, un total contra la suma de
  los ítems. Un modelo devuelve con la misma cara un total bien leído y uno
  inventado.
- **La aritmética la hace `core`**, no el modelo. Si el total leído no coincide
  con los ítems, se marca y lo resuelve la persona; no se ajusta solo.
- **Tope de consumo por empresa y por día**, igual que la tarea 3
  (`modules/asistente/limite.ts`).
- **Audit log** del alta, registrando que el origen fue un archivo leído y quién
  lo confirmó.

### Cómo verificar que quedó bien

- Fixtures con comprobantes reales anonimizados: una factura A, una B, un
  comprobante de transferencia. Guardados en el repo, no generados.
- Test de que un total que no cuadra con los ítems **no** se corrige solo: queda
  marcado para la persona.
- Test de que un CUIT mal leído se rechaza con `validarCuit`.
- Test de que el flujo deja el comprobante en `borrador` y nunca en `aprobada`.
- Mutation testing: romper el validador de totales y confirmar que un test se
  cae.
- `pnpm lint && pnpm typecheck && pnpm test` con código de salida 0.

---

## Lo que NO está en este documento, a propósito

- **Mails automáticos de saldos próximos a vencer.** Postergado por decisión de
  Fran del 12 de octubre de 2026 hasta que haya dominio propio. Ver
  `PENDIENTES.md`.
- **El selector de columnas en las cinco tablas de markup plano.** Decisión
  documentada, con la medición que la respalda. Ver `PENDIENTES.md`.
- Todo lo bloqueado por decisión de Fran (entorno `erp-prod`, Sentry, plan de
  hosting, Fase 3 / ARCA) y el estado del asistente. Ver `PENDIENTES.md`.
