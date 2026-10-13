# Handoff — tareas pendientes

Escrito el 12 de octubre de 2026, verificado contra el código de `main` en el
commit `c34689d`.

Este documento existe para que una sesión nueva pueda agarrar **una** de estas
tareas sin leer las otras y sin reconstruir el contexto. Cada sección es
autocontenida: objetivo, estado real, archivos, decisiones ya tomadas,
restricciones y cómo verificar.

**Acá entra sólo lo que ya tiene el plan armado.** Lo que falta pero todavía no
se investigó —y lo bloqueado, lo postergado y lo descartado— vive en
`PENDIENTES.md`, una línea por cosa. El reparto completo está en el encabezado
de ese archivo. Y vale en los dos sentidos: **una línea y el link, nunca el
contenido repetido.**

Eran cuatro: dos están hechas, la 2 se descartó, y **queda sólo la 3**.

| # | Tarea | Depende de | Tamaño |
|---|---|---|---|
| 1 | ~~Las notas de crédito suman en vez de restar~~ | — | **hecha** el 12/10/2026 |
| 2 | ~~Adjuntar archivos~~ (descartada) | — | — |
| 3 | Leer extractos bancarios y conciliar | nada | grande |
| 4 | ~~Leer facturas de proveedor~~ | — | **hecha** el 12/10/2026 |
| 5 | ~~Etapa 1: que los números del panel sean correctos~~ | — | **hecha** el 13/10/2026 |
| 6 | ~~Etapa 2: cuenta corriente con imputación~~ | — | **hecha** el 13/10/2026 |
| 7 | ~~Etapa 3: impuestos~~ | — | **hecha** el 13/10/2026 |
| 8 | ~~Etapa 4: estado de resultados~~ | — | **hecha** el 13/10/2026 |
| 9 | ~~Etapa 5: pantallas~~ | — | **hecha** el 13/10/2026 |
| 10 | ~~Etapa 6: stock, costo e IA~~ | — | **hecha** el 13/10/2026 |

Las tareas 3 y 4 son el "OCR". **La tarea 2 se descartó** (12 de octubre de
2026, decisión de Fran): la aplicación **no guarda los archivos ni permite
bajarlos después**. Recibe el archivo, lo lee, muestra lo leído para que una
persona lo confirme y lo descarta. Por eso las tareas 3 y 4 no dependen de nada
y **no usan `adjunto_path`, `pdf_path` ni Supabase Storage**. Leer las
referencias a la tarea 2 que queden más abajo con esto en mente.

---

## Reglas que valen para todas las tareas

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

## Tarea 1 — Las notas de crédito suman en vez de restar — HECHA

**Resuelta el 12 de octubre de 2026.** El signo vive ahora en un solo lugar,
`modules/_comunes/comprobantes.ts` (`totalConSigno`), y lo usan tanto
`financiero/service.ts` —en los tres lugares— como `clientes/service.ts`, que
antes tenía el `case` copiado a mano. Esa copia es lo que permitió que un lado
quedara bien y el otro mal.

`modules/financiero/service.test.ts` es el primer test del módulo: seis casos,
los dos mutantes del helper quedan detectados.

Medido en dev con una nota de crédito de 100.000: las ventas de octubre pasaron
de 530.900 a 430.900 y los cobros de la segunda semana de 120.000 a 20.000.

Lo que sigue abajo queda como registro de cómo estaba el problema.

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

> **Descartada el 12 de octubre de 2026, por decisión de Fran.** La aplicación
> **no guarda** los archivos ni permite bajarlos después: recibe el archivo, lo
> lee y vuelca los datos. No hace falta Supabase Storage ni tabla de adjuntos, y
> las tareas 3 y 4 **ya no dependen de esta**. Cuando esas tareas hablen de "la
> tarea 2" o de `adjunto_path`, leerlo con esto en mente. Lo único que se
> conserva es `modules/_comunes/tipo-archivo.ts`: detección del tipo de un
> archivo por su contenido (PDF, PNG, JPEG, WebP; faltan CSV y Excel). La
> sección de abajo es el diseño original y queda sólo como referencia.

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
- **El hash del extracto, no el extracto.** Como la aplicación no guarda los
  archivos (la tarea 2 se descartó), no queda nada contra qué comparar para
  saber si un extracto ya se procesó. Hay que registrar el **SHA-256** del
  archivo leído —es lo que ya decidió la tarea 4 para las facturas— y mirarlo
  antes de proponer movimientos. Sin eso, el test de "subir dos veces no
  duplica" no se puede cumplir.

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

## Tarea 4 — Leer facturas de proveedor — HECHA

**Terminada el 12 de octubre de 2026.** Andando de punta a punta y verificada
en el navegador con las facturas reales de Fran.

Qué quedó:

- `core/invoicing/lectura.ts` — `revisarTotalesLeidos`, que verifica que el
  total cierre según la letra. Es donde vive la regla de que en una B o una C
  el IVA va incluido.
- `modules/comprobantes/lectura.ts` — los normalizadores (importes, fechas,
  CUIT, numeración), el esquema que el modelo tiene que devolver, el prompt y
  `interpretar`, que arma la propuesta. Todo puro y con 26 tests.
- `modules/comprobantes/lectura-ruta.ts` — la ruta Express, con tope propio de
  consumo y el tipo de archivo validado por contenido.
- `features/comprobantes/compras.tsx` — el botón, el aviso de reparos y el
  formulario precargado.
- `scripts/probar-lectura.mts` — para volver a verificar contra archivos reales
  sin pasar por la aplicación.

**Lo que el papel enseñó y el plan no sabía.** Las tres facturas rompieron una
suposición cada una, y las tres reglas están en el prompt:

1. Un PDF de ARCA puede traer el mismo comprobante tres veces (ORIGINAL,
   DUPLICADO, TRIPLICADO). Sumarlos daba el triple.
2. Una B imprime "IVA contenido" por el régimen de transparencia fiscal (ley
   27.743), que **ya está adentro** del total. Sumarlo cargaba 1.382 pesos de
   más.
3. El modelo tomaba como razón social el **logo del software** que imprimió el
   PDF, y como concepto la palabra "FACTURA". Las dos cosas se arreglaron
   diciéndolo explícitamente en el prompt y se volvieron a verificar.

### Lo que quedó pendiente, y es de Fran

- **Una factura A de un proveedor real.** La A que se usó es la muestra de demo
  de un software contable. Las A reales son las que más varían entre
  proveedores y son el caso principal.
- **Detectar que la factura la emitió la propia empresa.** Sale de la factura C
  de Fran, que es una venta suya. No se puede hacer: **la empresa no tiene CUIT
  guardado** en ninguna tabla. Decisión de Fran del 12/10/2026: no se agrega por
  ahora. Cuando se agregue —y hace falta igual para la Fase 3, porque WSAA y
  WSFEv1 no andan sin él— la decisión ya está tomada: **avisar y dejar seguir**,
  no bloquear.
- **Todo asume pesos.** Decisión de Fran: el tipo de cambio no se modela. Una
  factura en moneda extranjera se carga con sus números pero sin registro de a
  qué cambio.

Lo que sigue abajo es el plan original, como registro.

### Objetivo

Que no haya que tipear a mano un comprobante que llegó por mail o por WhatsApp.

### Plan acordado con Fran (12 de octubre de 2026)

Se va con la **lectura 2: facturas de proveedor → `comprobantes_compra`**. Lo
pidió Fran así: subir un comprobante (PDF o imagen), que la aplicación lo
entienda y, **antes de guardar, mostrar una ventana para que una persona valide
los datos**. El archivo no se guarda.

Pasos, en orden:

1. **Leer el archivo.** Endpoint Express multipart (patrón de
   `modules/asistente/ruta.ts`) que recibe PDF o imagen **en memoria**
   (`multer.memoryStorage()`, que hay que volver a agregar a las dependencias)
   y nunca lo escribe a disco ni a ningún storage. El tipo se valida por
   contenido con `modules/_comunes/tipo-archivo.ts` (ya existe, con tests).
   Tope de 10 MB. La sesión y el rol de escritura se verifican **antes** de
   leer un solo byte.
2. **Extraer con el modelo.** El AI SDK y `@ai-sdk/openai` ya están
   instalados; el proveedor se elige en un solo lugar, `modules/asistente/ruta.ts`.
   Se le pide salida estructurada: proveedor, CUIT, letra, número, fechas,
   moneda, neto, IVA, total e ítems. **Verificar en la documentación y en el SDK
   instalado cómo se le pasa un PDF o una imagen y cómo se pide salida
   estructurada antes de escribir código**: no asumir la firma.
3. **Validar lo que devuelve.** Zod primero; después el dominio: CUIT con
   `validarCuit` (`core/tax/cuit.ts`), total contra neto + IVA con `Money`. Si
   no cuadra se **marca**, nunca se corrige solo. Si el CUIT coincide con un
   proveedor existente, se sugiere ese proveedor.
4. **Pantalla de validación.** El formulario de compra de
   `features/comprobantes/formulario.tsx`, precargado y con los campos dudosos
   marcados. Una persona lo revisa, corrige y recién ahí guarda. **Nada se crea
   desde el archivo directamente.**
5. **Guardar** por el mismo service de compras de siempre, con audit log que
   registre que el origen fue un archivo leído, quién lo confirmó, y el nombre y
   el hash SHA-256 del archivo (no el archivo).
6. **Tope de consumo** por empresa y por día (`modules/asistente/limite.ts`).
7. **Manual** (`docs/ayuda/04-comprobantes.md`) y, si se suma una ruta, la lista
   blanca de `features/asistente/rutas.ts`.

Aclaración sobre "aprobar": las **compras no tienen máquina de estados** (sólo
las ventas tienen `borrador → enviada → aprobada`). Para una compra, la
validación humana es el paso de confirmar el formulario precargado. No hay un
estado "aprobada" que agregar.

Pendiente de Fran/Jesi: **2 o 3 facturas reales de proveedor anonimizadas**
(PDF o foto, idealmente una A y una B) para usar de fixtures. Sin ellas se puede
armar la estructura y los tests con datos inventados, pero la lectura real no se
puede dar por probada.

### Alternativas descartadas por ahora

Quedan de contexto. La lectura 3 (respaldo de una venta) no tiene sentido sin
guardar el archivo. La lectura 1 (comprobante de transferencia de un cliente →
`movimiento` de ingreso) sigue siendo válida y es otra tarea distinta:
**confirmar con Jesi** si además la quiere.

### La ambigüedad original

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
   única tabla con una columna de adjunto (`adjunto_path`, que ya no se va a
   usar).
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

- `comprobantes_compra.adjunto_path` existe y **nada lo escribe, ni lo va a
  escribir**: la tarea 2 se descartó y los archivos no se guardan.
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

## Tareas 5 a 10 — Lo que salió del análisis del 30 de septiembre

Un análisis externo recorrió la app con la demo de `scripts/datos-demo.sql`. Se
validó punto por punto el 12 de octubre de 2026, reproduciendo sus mismos datos
(la demo corrida con fechas de 51 días atrás) y comparando con la misma demo al
día. Las decisiones de cada etapa las tomó Fran ese mismo día y **no se
re-preguntan**. Se hacen en orden, en una sola rama y un solo PR.

### Qué dio la validación

- **"Sin datos" en DSO, DPO, rotación y margen no era falta de imputación.**
  Los KPIs miran los últimos 30 días y la demo terminaba en agosto. Con datos al
  día calculan.
- **Las pestañas que "no responden al clic" no se reproducen.** Nada las tapa y
  responden con eventos de puntero, en escritorio y en celular.
- **Bugs reales**, todos en la Etapa 1:
  - **B1:** el margen bruto se calcula sobre el total **con IVA** contra un costo
    sin IVA. Con la demo al día da 46,10 % contra 34,78 % real.
  - **B2:** la proyección descarta todo lo vencido (`proyectarCaja` filtra por
    semana). Con la demo vieja da pagos en cero con $ 13,7 M impagos.
  - **B3:** la proyección no descuenta lo ya cobrado o pagado, y suma los cheques
    en cartera encima de las facturas que pagan.
  - **B4:** el formulario de venta **nunca guarda `productoId`** (un `<datalist>`
    sólo sugiere el texto). Los ítems quedan con costo 0 para el margen, y el
    manual dice lo contrario.
  - **B5:** el panel no filtra por estado ni por moneda (Clientes sí), y suma los
    ítems de las notas de crédito como salidas de stock.
  - **B6:** "Ventas por mes" grafica con IVA.
  - **B7:** "Próx. vencimiento" esconde lo vencido.
  - **B8:** Historial muestra "exportacion" crudo y la fecha en otro formato.

### Estado: las seis etapas están HECHAS (13 de octubre de 2026)

Todo en un solo PR, como decidió Fran. Lo que hay que saber para llevarlo a
producción y lo que quedó afuera:

- **Migraciones 0014 a 0018**: imputaciones, impuestos calculados,
  resultados, alcance de los links y movimientos de stock. Aplicarlas en
  Supabase con el procedimiento de siempre. Las que tocan datos (0014 y 0018)
  recorren empresa por empresa declarando `app.tenant_id`: con FORCE ROW LEVEL
  SECURITY, un rol que no es superusuario no ve ninguna fila sin eso.
- **La demo cambió**: `scripts/datos-demo.sql` carga pagos imputables con
  contraparte, IVA calculado, IIBB con retenciones, categorías, gastos
  recurrentes y movimientos de stock. Para verla hay que borrar y volver a
  cargar la organización. Con estos números **la empresa de demo pierde plata**
  casi todos los meses (factura 1 a 2 M netos y paga 1,65 M de sueldos): es un
  dato de la demo, y conviene revisar los volúmenes antes de mostrarla.
- **La "Lectura del mes" usa OpenAI** con la misma key del asistente y un tope
  propio (`EXPLICACION_LIMITE_DIARIO`, 10 por defecto). No se probó contra la
  API real, para no gastar: está cubierta con tests que reemplazan al modelo.
- **Simplificaciones asumidas**: los KPIs y el estado de resultados usan el
  costo actual del producto para el costo de ventas (los movimientos de venta
  guardan el costo histórico, pero todavía no se leen de ahí); el saldo a
  favor de IIBB se arrastra igual que el de IVA; Ganancias no entra en el
  resultado neto. El IVA calculado necesita **validación de un contador**.
- **Revalidación del 13/10/2026** contra el análisis original: faltaba la
  **sugerencia de compra con costo de reposición** para lo marcado "Reponer",
  que no había entrado en ninguna etapa. Se agregó en Stock (regla en
  `core/stock/reposicion.ts`). También se corrigió que el Historial mostrara
  "movimientos_stock" crudo y que la demo guardara un cliente "en_mora" a mano.
- **Quedó afuera por decisión de Fran**: comparativos mes contra mes y contra
  el año anterior, presupuesto, proyección a 12 meses, retenciones de IVA y
  Ganancias, registro de ingresos y PIN del link, nota de crédito y duplicado
  desde el detalle, y PDF y mail del comprobante.

### Tarea 5 — Etapa 1: que los números existentes sean correctos

- Margen, ventas del período y "Ventas por mes" sobre **neto**. DSO y por
  cobrar siguen con total, porque la deuda incluye IVA.
- El panel cuenta sólo `enviada` y `aprobada`, y sólo ARS (igual que Clientes).
  Las notas de crédito restan de las salidas y del costo.
- Proyección:
  - **pagos vencidos e impagos → semana 1**;
  - **cobros vencidos no se proyectan**: se informan aparte como
    `cobrosVencidos`;
  - lo cobrado o pagado por contraparte se descuenta de sus comprobantes más
    viejos (FIFO) hasta que exista imputación (Etapa 2);
  - los cheques en cartera no se suman encima de facturas ya cubiertas.
- Formulario de venta: elegir un producto guarda `productoId` y precarga precio
  y descripción. Corregir `docs/ayuda/04-comprobantes.md`.
- "Próx. vencimiento" muestra el vencido más viejo, si lo hay.
- Historial: etiqueta "Exportación" y fecha `dd/mm/aaaa hh:mm`.
- `datos-demo.sql`: pagos y cobros con contraparte, importes con IVA, impuestos
  coherentes con lo facturado.

### Tarea 6 — Etapa 2: cuenta corriente con imputación

- **Imputaciones:** una tabla nueva que vincula un movimiento con uno o varios
  comprobantes, con importe parcial. Lo no imputado queda **a cuenta**.
- **Saldo por comprobante** derivado. Estado de cobro o pago (pendiente,
  parcial, cobrada, vencida) y fecha de vencimiento en las listas de ventas y
  compras.
- La proyección usa el saldo de cada comprobante; reemplaza el FIFO de la
  Etapa 1.
- **Mora calculada:** un cliente con facturas vencidas hace más que
  `umbral_mora_dias` está en mora. **Se quita "En mora" del formulario**, que
  queda con Activo e Inactivo.
- **Límite de crédito:** avisa y no bloquea. Se marca en la lista y la ficha, y
  aparece un aviso al facturar.
- Ficha de cliente y de proveedor: saldo, comprobantes abiertos, antigüedad de
  deuda (0–30, 31–60, 61–90, +90), cheques y crédito usado.
- Cheques vinculados al cobro que los recibió.

### Tarea 7 — Etapa 3: impuestos

- **Régimen fiscal de la empresa en Parámetros**: Responsable Inscripto o
  Monotributo. La app muestra sólo lo que corresponde al régimen.
- **Posición de IVA calculada** por mes: débito de ventas menos crédito de
  compras menos saldo a favor anterior. **Reemplaza la carga manual de IVA**;
  los registros manuales existentes quedan como histórico. En Impuestos sólo se
  carga el pago.
- **Retenciones y percepciones: sólo IIBB, incluido SIRCREB.** Se cargan y
  restan del IIBB del período. IVA y Ganancias quedan afuera por decisión.
- **Ganancias como 10 anticipos más el saldo anual de la DDJJ.** Los importes
  los carga la persona; la app no estima el impuesto.
- Validar el modelo con un contador antes de darlo por cerrado.

### Tarea 8 — Etapa 4: estado de resultados

- **Base devengado.** Ventas y compras por fecha del comprobante, en neto. Los
  gastos sin comprobante, por fecha del movimiento con su categoría.
- **Categorías:** lista inicial editable por empresa (Sueldos y cargas,
  Alquiler, Servicios, Fletes, Comisiones bancarias, Impuestos, Otros).
- **Gastos recurrentes: sólo se proyectan.** Una plantilla con importe, día del
  mes, categoría y cuenta entra en la proyección de caja; no genera
  movimientos.
- Resultado mensual: ventas netas, costo de ventas, margen bruto, gastos por
  categoría, resultado operativo y resultado neto.
- **Rentabilidad por cliente, por producto y por categoría de producto.**

### Tarea 9 — Etapa 5: pantallas

- "Aprobada" **se muestra como "Confirmada"**. Sólo cambia la etiqueta: el
  enum, la máquina de estados y los datos no se tocan.
- Link de solo lectura con **alcance por módulo**. No se agregan registro de
  ingresos ni PIN.
- Cuenta en dólares consolidada al **oficial comprador**, con `cotizaciones`.
- Detalle de factura: acción **"Registrar cobro"**, ya imputado (usa la
  Etapa 2). Nota de crédito y duplicar quedan afuera.
- Cheques: aviso del plazo de presentación (30 días desde la fecha de pago) y
  acciones de depositar o endosar desde la lista.
- KPIs: un desglose de qué incluye cada uno, y "Sin datos" que explique qué
  falta cargar.

### Tarea 10 — Etapa 6: stock, costo e IA

- **La facturación mueve stock**, con una tabla de movimientos. Una venta
  confirmada descuenta, una nota de crédito devuelve, una compra con ítems suma
  y hay ajustes manuales. `stock_actual` deja de editarse a mano. Reemplaza la
  decisión de modelado 3.
- **Las compras tienen ítems con producto**: es la condición para lo anterior y
  para el costo.
- **Costo por promedio ponderado**, recalculado en cada compra. Reemplaza la
  decisión 4.
- **IA que explica:** un texto que explica variaciones y alertas anticipadas
  ("en la semana 6 quedás bajo el mínimo"). Los números salen de `core`; el
  modelo sólo redacta. Usa el proveedor y el tope diario del asistente.
- **Fuera de esta tanda, por decisión:** comparativos, presupuesto, proyección a
  12 meses, PIN y registro de ingresos del link, nota de crédito y duplicar desde
  el detalle, y PDF y mail (dependen de ARCA y del dominio).

---

## Lo que NO está en este documento, a propósito

- **Mails automáticos de saldos próximos a vencer.** Postergado por decisión de
  Fran del 12 de octubre de 2026 hasta que haya dominio propio. Ver
  `PENDIENTES.md`.
- **El selector de columnas en las cinco tablas de markup plano.** Decisión
  documentada, con la medición que la respalda. Ver `PENDIENTES.md`.
- Todo lo bloqueado por decisión de Fran (entorno `erp-prod`, Sentry, plan de
  hosting, Fase 3 / ARCA) y el estado del asistente. Ver `PENDIENTES.md`.
