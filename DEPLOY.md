# Deploy — ERP PyME

Estado del deploy: qué plataformas usamos y por qué, qué está hecho, qué falta
y qué problemas hay abiertos.

> Última actualización: 10 de agosto de 2026. **Supabase `erp-dev` está
> creado, migrado y verificado.** Falta `erp-prod`, que se posterga a propósito
> hasta que el circuito completo funcione con dev. No hay nada en Railway ni en
> Vercel todavía.

---

## 1. La arquitectura: tres piezas independientes

| Pieza | Plataforma | Plan | Deploy |
| --- | --- | --- | --- |
| Frontend (SPA Vite) | Vercel | Hobby | Automático en push a `main` |
| Backend (Express) | Railway | Hobby, USD 5/mes | Automático en push a `main` |
| Base de datos + Storage | Supabase | — | Migraciones a mano |

### Frontend — Vercel

SPA estática generada por Vite, conectada al repo de GitHub. Cada push a `main`
dispara build y deploy.

Mientras no haya clientes pagos alcanza el plan Hobby. Cuando los haya, hay que
pasar a Vercel Pro o migrar a Cloudflare Pages, que permite uso comercial en su
plan gratuito. Para que esa migración sea trivial, el frontend **no usa ningún
paquete `@vercel/*`** y la URL de la API sale siempre de `VITE_API_URL`.

### Backend — Railway

Contenedor Docker corriendo Express como **proceso vivo 24/7**. No es
serverless y **no debe habilitarse scale-to-zero ni suspensión por
inactividad**.

El motivo es que pg-boss corre dentro del mismo proceso: si el contenedor se
duerme dejan de correr los jobs de recálculo de proyección, los snapshots de
KPIs, las alertas de vencimiento y los reintentos de emisión. Además las
llamadas a ARCA necesitan reintentos sin límite de tiempo de ejecución.

> Nota: pg-boss todavía **no está implementado** — no está en las dependencias
> ni existe `src/jobs/`. La restricción vale igual como decisión de
> arquitectura, pero hoy no hay jobs que se pierdan.

### Base de datos y Storage — Supabase

Postgres administrado y Storage, accedidos **solo desde el backend**. Nunca
`supabase-js` desde el navegador.

Van **dos proyectos separados**, `erp-dev` y `erp-prod`, para no probar
migraciones destructivas contra datos fiscales reales. Las migraciones de
Drizzle se versionan en el repo y se aplican a mano.

### Desarrollo local

Postgres con `docker compose up -d` y el backend corriendo en la máquina. No
hace falta deployar nada.

Para probar contra `erp-dev` sin deployar, alcanza con exportar `DATABASE_URL`
apuntando a Supabase antes de levantar el backend: la variable del entorno le
gana al `.env`, así que no hay que tocar el archivo. Es el paso que conviene
hacer antes de Railway, porque separa los problemas de la base de los del
contenedor. Los tests de integración corren contra ese mismo
Postgres con el rol `erp_app`, así que RLS está activo durante los tests; en CI
la base es un service container efímero. No usamos Testcontainers: el
aislamiento entre tests lo da RLS, porque cada uno crea su propia organización.

### Todavía sin configurar

- **Monitoreo**: Sentry en frontend y backend.

---

## 2. Qué ya está hecho

Dos commits en `main`, ya pusheados a `origin`.

### `4486848` — Containerize the backend for Railway deployment

- **`packages/backend/Dockerfile`**. Buildea desde la raíz del monorepo para que
  pnpm resuelva `@erp/core`. Copia todos los `package.json` primero para cachear
  la capa de dependencias. Instala con `--prod`, así que `drizzle-kit` y
  `vitest` no entran a la imagen.
- **Sin paso de compilación.** `@erp/core` exporta TypeScript crudo
  (`"." : "./src/index.ts"`), así que el contenedor corre `tsx` directamente.
  Por eso `tsx` pasó de `devDependencies` a `dependencies`.
- **`.dockerignore`** nuevo.
- **`.env.example` reescritos.** El del backend listaba 2 de las 12 variables
  que el código realmente lee, y omitía `BETTER_AUTH_SECRET`, sin la cual el
  proceso no arranca. Ahora ambos aclaran en qué plataforma va cada uno.

Verificado de punta a punta: la imagen buildea, el contenedor arranca,
`/health` responde `{"ok":true}` y `/api/auth/get-session` llega a Postgres y
devuelve 200.

### `5c2214d` — Log forwarded IP headers to settle Railway proxy behaviour

Middleware **temporal** `[ip-debug]` en `packages/backend/src/index.ts`, que
loguea los headers de IP de las primeras 20 requests. El porqué está en el
problema 1, más abajo.

### Supabase `erp-dev`, el 10 de agosto de 2026

Hecho en este orden, que es el que importa:

1. Proyecto `erp-dev` creado en **us-west-2**, con **Enable Data API
   destildado en el formulario de creación**. Resultó más simple que el paso
   de Settings → API que decía el plan: nace apagada y no hay ventana en la
   que las tablas estén expuestas.
2. Rol `erp_app` creado a mano en el SQL Editor, con contraseña fuerte,
   **antes** de migrar.
3. Migraciones aplicadas con `DATABASE_URL_MIGRATIONS` apuntando a `postgres`
   por el pooler en 5432.
4. Verificado.

Lo que dejó verificado la corrida, y no conviene volver a asumir:

- **El pooler acepta roles custom.** Era la duda abierta: `erp_app.<ref>`
  funciona igual que `postgres.<ref>`. Sin esto, el rol sin BYPASSRLS no habría
  podido conectarse y todo el diseño de aislamiento se caía.
- **La migración no pisó la contraseña.** La app conecta con la contraseña
  generada a mano, así que el `IF NOT EXISTS` del problema 2 hizo su trabajo.
- **RLS filtra en Supabase, no solo en local.** Con `erp_app` y sin declarar
  `app.tenant_id`, una tabla de negocio devuelve cero filas.
- 14 de 22 tablas en `public` con `relrowsecurity` y `relforcerowsecurity`; las
  8 restantes son las de BetterAuth. Coincide con la base migrada desde cero en
  el CI.

`packages/backend/verificar-supabase.mjs` corre esas comprobaciones. Se usa con
`DATABASE_URL` apuntando al rol de la aplicación, y hay que volver a correrlo
cuando exista `erp-prod`.

**No hacer:** el `Enable automatic RLS` del formulario de creación. Habilita
RLS en toda tabla nueva pero no crea políticas, así que las tablas de
BetterAuth quedarían con RLS y cero políticas, y `erp_app` —que no es su
dueña— no podría leerlas ni escribirlas. Nadie podría iniciar sesión.

---

## 3. Lo que sigue

1. **Railway**: crear el servicio apuntando a `packages/backend/Dockerfile` con
   contexto en la raíz, cargar variables, **desactivar scale-to-zero**,
   healthcheck a `/health`. Región en **US West**, para que quede en la misma
   costa que la base.
2. **Vercel**: crear el proyecto sobre `packages/frontend`, cargar
   `VITE_API_URL` con la URL de Railway. Ojo con el huevo y la gallina:
   `FRONTEND_URL` en Railway necesita la URL de Vercel y `VITE_API_URL` en
   Vercel necesita la de Railway, así que Railway se configura en dos pasadas.
   Si falta la segunda, el síntoma es CORS bloqueando todo.
3. **Leer `[ip-debug]`** en los logs del primer deploy, resolver el problema 1
   y borrar el middleware.
4. **`erp-prod`**: repetir todo lo de la sección anterior, con otra contraseña
   en cada rol.
5. **Sentry**: proyectos de frontend y backend, DSNs por entorno.

---

## 4. Problemas abiertos

### Problema 1 — Rate limiting por IP detrás del proxy de Railway

**Estado: pendiente de medición en el primer deploy.**

BetterAuth resuelve la IP del cliente leyendo `x-forwarded-for` por su cuenta;
no usa `req.ip` de Express, así que `app.set("trust proxy")` **no sirve para
nada acá**. Solo confía en el header si trae un único valor. Ante una cadena de
varios saltos devuelve `null` y mete a todos los clientes en un bucket
compartido `"no-trusted-ip"`.

Si eso pasa, los límites por defecto se vuelven globales para toda la
plataforma:

| Ruta | Límite compartido entre todos |
| --- | --- |
| `/sign-in*`, `/sign-up*`, `/change-password*` | 3 cada 10 segundos |
| `/request-password-reset`, `/forget-password*` | 3 cada 60 segundos |
| resto de `/api/auth` | 100 cada 10 segundos |

En concreto: **la cuarta persona que intente entrar en una ventana de 10
segundos recibe un 429**. Un lunes a la mañana con cinco empleados logueándose
a la vez, dos no entran. Como DoS es trivial: 4 requests cada 10 segundos y
nadie de ningún tenant puede iniciar sesión.

Dos agravantes: el rate limiting **solo se activa en producción**
(`enabled ?? isProduction`), así que es imposible de reproducir en local; y el
storage por defecto es `memory`, o sea que el bucket vive en el contenedor.

Que ocurra o no depende de si Railway reemplaza el header o le appendea. **La
documentación de Railway se contradice a sí misma**: en el mismo hilo un
empleado dice que lo strippean en el edge y otra respuesta dice que appendean
sin strippear. La guía oficial llega a afirmar que el cliente puede spoofear el
header pero que la IP real siempre queda a la izquierda "porque nuestro proxy
appendea a la cadena", lo cual es incoherente: si appendea, la IP real queda a
la derecha. `X-Real-IP` está reconocido como roto cuando el CDN está activo.

Por eso se midió en vez de asumirse. En el primer deploy, mirar `ip-debug` en
los logs de Railway y el campo `saltosXff`:

- **1** → el default de BetterAuth funciona, no hay nada que hacer.
- **2 o más** → configurar `advanced.ipAddress.trustedProxies`.
- **0** → no llega ningún header; evaluar `x-real-ip` si viene poblado.

En los tres casos, borrar el middleware después.

### Problema 2 — El rol de la aplicación tiene la contraseña en el repo

**Estado: resuelto en `erp-dev`. Vuelve a estar abierto para `erp-prod`.**

`packages/backend/drizzle/0001_rls_policies.sql:7`:

```sql
CREATE ROLE erp_app LOGIN PASSWORD 'erp_app';
```

Correr las migraciones tal cual contra Supabase deja al rol de la aplicación
con contraseña `erp_app`, pública en GitHub, contra una base expuesta a
internet. Y ese rol puede hacer `SET app.tenant_id` a cualquier valor, así que
RLS no protege: sería acceso a los datos de todos los tenants.

La migración usa `IF NOT EXISTS` justamente para permitir el caso de
producción, pero eso solo sirve si el rol **se crea a mano antes** de migrar.
Si se migra primero, ya quedó con la contraseña débil.

En `erp-dev` se hizo en ese orden y quedó verificado: la aplicación conecta con
la contraseña generada a mano, y un rol tiene una sola. El procedimiento hay
que repetirlo tal cual en `erp-prod`.

### Problema 3 — Las tablas de auth no tienen RLS y Supabase expone la Data API

**Estado: mitigado en `erp-dev`. Sigue abierto como riesgo estructural.**

Las migraciones habilitan RLS en las 14 tablas de negocio. Las de BetterAuth
(`user`, `session`, `account`, `verification`, `organization`, `member`,
`invitation`, `twoFactor`) son `pgTable` en el schema `public` y quedan afuera.

Medido sobre una base migrada desde cero el 8 de agosto de 2026: de 22 tablas en
`public`, 14 tienen `relrowsecurity` y `relforcerowsecurity`; las 8 restantes son
exactamente las de BetterAuth.

En Supabase la Data API (PostgREST) se expone sobre `public` por defecto y los
roles `anon`/`authenticated` reciben grants por default privileges. Con la anon
key —que es pública por diseño— eso implicaría **tokens de sesión y hashes de
contraseña legibles por HTTPS**.

La mitigación es desactivar la Data API entera, ya que el frontend nunca usa
`supabase-js`. En `erp-dev` se hizo **desde el formulario de creación**, que es
mejor que apagarla después: nunca existió una ventana con las tablas expuestas.

Sigue siendo un riesgo estructural, porque la protección depende de un checkbox
del dashboard y no del repositorio. Alcanza con que alguien encienda la Data
API en un proyecto futuro para exponer tokens de sesión y hashes de
contraseña.

La solución de fondo **no es** RLS sobre esas tablas: el backend legítimamente
necesita leerlas y escribirlas con `erp_app`, y RLS sin políticas lo dejaría
afuera. Sería un `REVOKE` explícito de `anon` y `authenticated` sobre las
tablas de auth, en una migración, para que no dependa de la configuración del
dashboard.

### Problema 4 — El puerto de Supabase afecta la numeración fiscal

**Estado: aplicado en `erp-dev`. Repetirlo en `erp-prod`.**

La numeración sin huecos usa `pg_advisory_xact_lock` y requiere session mode.
En Supabase, **session mode es el puerto 5432** del pooler; el 6543 quedó solo
como transaction mode desde que deprecaron session mode ahí, en febrero de
2025. La conexión directa además es IPv6-only salvo que se pague el add-on de
IPv4, así que el pooler en 5432 es la opción correcta.

### Problema 5 — `pnpm` no se encuentra en algunas terminales

**Estado: resuelto. Era el PATH, no la herramienta.**

El síntoma era `pnpm: The term 'pnpm' is not recognized` en PowerShell, o
`Unable to find package manager binary` desde turbo, en una máquina donde pnpm
está instalado y funciona.

La causa es que **Windows no actualiza el PATH de las terminales ya abiertas**.
Cualquier ventana anterior a la instalación de pnpm no lo ve, por más que el
binario esté en `%APPDATA%\npm`. Se arregla cerrando la ventana y abriendo otra.

No es un problema de turbo ni de corepack: verificado el 10 de agosto de 2026,
en una PowerShell nueva `pnpm --version` y `corepack pnpm --version` devuelven
las dos `11.20.0`.

En el CI no puede pasar: el workflow usa `pnpm/action-setup`, que instala el
binario y lo deja en el PATH antes de que turbo arranque.

---

## 5. El error más común de esta configuración

Las variables de entorno se cargan en **dos lugares distintos**: las del
frontend en Vercel, las del backend en Railway. Confundirlas es la fuente de
error más habitual.

### Backend → Railway

| Variable | Nota |
| --- | --- |
| `DATABASE_URL` | Rol `erp_app`, pooler puerto 5432 |
| `BETTER_AUTH_SECRET` | Obligatoria, el proceso no arranca sin ella |
| `BETTER_AUTH_URL` | URL pública de Railway |
| `FRONTEND_URL` | URL de Vercel. Gobierna CORS y los links de los mails |
| `RESEND_API_KEY`, `RESEND_FROM` | Sin esto nadie acepta invitaciones ni recupera contraseña |
| `PORT` | La inyecta Railway, no hace falta setearla |

`DATABASE_URL_MIGRATIONS` y las `SEED_*` **no** van a Railway: son de la
máquina del desarrollador.

### Frontend → Vercel

| Variable | Nota |
| --- | --- |
| `VITE_API_URL` | URL de Railway. Vite la inlinea en el bundle: es pública, nunca un secreto |
