# Deploy — ERP PyME

Estado del deploy: qué plataformas usamos y por qué, qué está hecho, qué falta
y qué problemas hay abiertos.

> Última actualización: 10 de agosto de 2026. **El circuito completo está
> andando**: Vercel → Railway → Supabase `erp-dev`, con login funcionando de
> punta a punta. Falta el **dominio propio**, bloqueado hasta definir el
> nombre, y `erp-prod`, que se posterga a propósito.

---

## 1. La arquitectura: tres piezas independientes

| Pieza | Plataforma | Plan | Deploy |
| --- | --- | --- | --- |
| Frontend (SPA Vite) | Vercel | Hobby | Automático en push a `main` |
| Backend (Express) | Railway | Hobby, USD 5/mes | Automático en push a `main` |
| Base de datos + Storage | Supabase | — | Migraciones desde el CI |

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
migraciones destructivas contra datos fiscales reales.

### Cómo se aplican las migraciones

Desde GitHub Actions, **nunca desde el contenedor de Railway**. Migrar requiere
el rol dueño, que puede saltear RLS y leer los datos de todos los tenants; esa
credencial no tiene por qué vivir en un proceso expuesto a internet 24/7. En el
CI existe solo durante el job. Por eso además el `Dockerfile` instala con
`--prod` y deja `drizzle-kit` fuera de la imagen.

- **`erp-dev`**: automático. El job `migrar-dev` de `ci.yml` corre después de
  lint, typecheck, tests y build, solo en push a `main`. Como Railway tiene
  *Wait for CI* activado, el orden queda garantizado: **tests → migraciones →
  deploy**. Si la migración falla, el código nuevo no sube.
- **`erp-prod`**: a mano, con el workflow aparte `migrar-prod.yml`, que solo se
  dispara con *Run workflow* y pide escribir `MIGRAR PRODUCCION` para
  confirmar. Va separado del CI porque Railway espera a que **todas** las
  Actions terminen: un job esperando aprobación dejaría los deploys colgados.

La credencial vive en Settings → Environments del repo. El entorno **`erp-dev`**
ya está creado, con su secret `DATABASE_URL_MIGRATIONS` apuntando al rol
`postgres` por el pooler en 5432. Falta el entorno **`erp-prod`**, que se crea
igual cuando exista ese proyecto; si querés que producción además necesite el
visto bueno de otra persona, agregale *Required reviewers*.

Mientras el secret de un entorno no exista, el paso se saltea con una
advertencia en vez de fallar: si fallara, con *Wait for CI* activado dejaría
todos los deploys bloqueados.

**El backend chequea al arrancar** que la base tenga aplicadas todas las
migraciones que el código conoce, y se niega a levantar si le faltan, nombrando
cuáles (`src/db/migraciones.ts`). Sin eso, el desfasaje entre el deploy del
código y el de la base se manifiesta como errores 500 salteados en la primera
consulta que toque una columna nueva. Si la base está *adelante* —un rollback
del código— avisa pero deja arrancar, porque volver atrás es legítimo.

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
loguea los headers de IP de las primeras 20 requests. Ya cumplió su función y
fue borrado: la medición y su conclusión están en el problema 1, más abajo.

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

### Railway, el 10 de agosto de 2026

Servicio único desde `packages/backend/Dockerfile`, con Root Directory en la
raíz del monorepo. **Railway propone un servicio por cada package del
workspace: hay que borrar los otros cuatro antes de aplicar.** `core`,
`design-system` y `arca` son librerías sin nada que correr, y el frontend va a
un CDN.

Configuración que importa: builder **Dockerfile** (el default, Railpack, ignora
el Dockerfile y adivina mal en un monorepo), región **US West** para quedar en
la misma costa que Supabase, healthcheck en `/health`, **Serverless apagado**
—es la restricción de arquitectura por pg-boss—, *Wait for CI* encendido, y
watch paths sobre `packages/backend/**` y `packages/core/**`, porque `@erp/core`
viaja adentro de la imagen.

Verificado contra el deploy: `/health` responde `{"ok":true}`, y
`/api/auth/get-session` devuelve `200 null` — que es la prueba de que llega a
Postgres, porque una base inalcanzable daría 500.

### Vercel, el 10 de agosto de 2026

Proyecto sobre `packages/frontend`, preset Vite, con `VITE_API_URL` apuntando a
Railway. Esa variable **se incrusta en el bundle durante el build**: es pública
por diseño, y cambiarla exige redeployar, no alcanza con guardarla.

Dos cosas que hicieron falta y no eran obvias:

- **`vercel.json` y `public/_redirects`** para servir `index.html` en cualquier
  ruta desconocida. Sin eso, entrar directo a `/clientes` o apretar F5 estando
  ahí devuelve 404: la SPA rutea del lado del cliente y el CDN busca un archivo
  que no existe. Solo se ve en producción, nunca en desarrollo. Los dos
  archivos dicen lo mismo a hosts distintos, así que el mismo build sirve para
  Vercel, Cloudflare Pages y Netlify.
- **La cookie de sesión entre sitios.** El login respondía 200 y la pantalla
  volvía a login sin ningún error: `vercel.app` y `railway.app` son sitios
  distintos, y con el `SameSite=Lax` que BetterAuth usa por defecto el
  navegador nunca devolvía la cookie. Resuelto con `SameSite=None; Secure;
  Partitioned`, que es un puente hasta el dominio propio.

---

## 3. Lo que sigue

### 1. Dominio propio — decidido, falta comprarlo

Bloqueado hasta definir el nombre. La estructura ya está decidida:

```
erp.com        →  Vercel   (todo lo que el usuario ve en la barra)
api.erp.com    →  Railway  (invisible: solo lo llama el JavaScript)
```

**El frontend va en el dominio raíz, no en `app.`**, porque es lo único que el
usuario ve: la barra tiene que decir `erp.com/login`, no `app.erp.com/login`.
El raíz necesita registros A o ALIAS en vez de un CNAME, que es un poco más de
trabajo en el registrador y nada más.

El subdominio `api.` no es una concesión: **nunca aparece en la barra de
direcciones**. Las llamadas a la API las hace `fetch` desde el JavaScript, no
quedan en el historial y el usuario no las ve nunca.

Por qué importa además de lo estético: compartiendo dominio, la cookie de
sesión pasa a ser de primera parte y desaparece la dependencia de la política
de cookies de terceros de cada navegador. Hoy Safari bloquea esas cookies por
defecto, así que el login puede fallar en iPhone y Mac mientras el frontend y
el backend estén en `vercel.app` y `railway.app`.

**Descartado: proxear la API por Vercel** para que todo salga de `erp.com` sin
ningún subdominio. Cuesta un salto de latencia en cada request, gasta ancho de
banda de Vercel, es configuración específica de esa plataforma —lo que el
proyecto evita— y sobre todo **rompería la resolución de IP del problema 1**:
Railway vería la IP del edge de Vercel y todos los clientes volverían al mismo
bucket de rate limiting, esta vez con una IP equivocada en lugar de ninguna.
Todo eso para esconder un subdominio que nadie iba a ver.

Cuando el dominio exista:

| Dónde | Variable | Valor |
| --- | --- | --- |
| Railway | `FRONTEND_URL` | `https://erp.com` |
| Railway | `BETTER_AUTH_URL` | `https://api.erp.com` |
| Railway | `COOKIE_DOMAIN` | `.erp.com` — con el punto inicial |
| Vercel | `VITE_API_URL` | `https://api.erp.com` |

`COOKIE_DOMAIN` ya está implementada y probada en `auth.ts`: seteada, la cookie
se emite para el dominio padre con `SameSite=Lax`; vacía, se mantiene el
comportamiento actual.

**Después de cambiar `VITE_API_URL` hay que redeployar Vercel**, no alcanza con
guardar: Vite incrusta esa variable en el bundle durante el build.

Verificación: en DevTools → Network, el `Set-Cookie` de `sign-in/email` tiene
que decir `Domain=.erp.com` y `SameSite=Lax`, sin `Partitioned`. Y probar desde
un iPhone, que es el motivo de todo esto.

Efecto esperado: la URL vieja de `vercel.app` sigue cargando pero deja de poder
iniciar sesión, porque el CORS pasa a permitir solo el dominio nuevo.

### 2. `erp-prod`

Repetir todo lo de Supabase de la sección anterior, con otra contraseña en cada
rol y su propio `BETTER_AUTH_SECRET`.

### 3. Sentry

Proyectos de frontend y backend, DSNs por entorno.

---

## 4. Problemas abiertos

### Problema 1 — Rate limiting por IP detrás del proxy de Railway

**Estado: resuelto el 10 de agosto de 2026, con medición contra el deploy.**

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

Como la documentación de Railway se contradecía sobre si su proxy reemplaza el
header o le appendea, se midió con el middleware `[ip-debug]` en vez de
asumirlo.

**Lo que se midió.** Con dos requests: uno normal, y otro con
`X-Forwarded-For`, `X-Real-IP` y `CF-Connecting-IP` inventados por el cliente.

| Header | Request normal | Con valor falsificado |
| --- | --- | --- |
| `x-forwarded-for` | `<cliente>, <proxy>` — 2 saltos | el valor falso desaparece |
| `x-real-ip` | `<cliente>` — 1 solo valor | el valor falso desaparece |
| `cf-connecting-ip` | ausente | **el valor falso llega intacto** |

Y BetterAuth confirmó el diagnóstico por su cuenta, con este warning en los
logs del primer deploy: *"Rate limiting could not determine a client IP and is
falling back to a single shared per-path bucket."*

**El arreglo.** `advanced.ipAddress.ipAddressHeaders: ["x-real-ip"]` en
`auth.ts`. Railway pisa ese header, así que no es falsificable, y trae un único
valor, que es lo que BetterAuth resuelve sin configuración extra.

Se prefirió a `trustedProxies` —la otra opción válida— porque esa obliga a
declarar el rango de IPs del proxy de Railway, que puede cambiar sin aviso: si
cambia, la resolución falla cerrada y se vuelve al bucket compartido sin que
nadie se entere.

**`cf-connecting-ip` queda descartado para siempre**: es el único de los tres
que el cliente puede fijar a lo que quiera.

**Cuándo volver a medir.** Si Railway dejara de mandar `x-real-ip` —por ejemplo
al activar su CDN, caso en el que su documentación reconoce que ese header se
rompe—, la IP vuelve a ser irresoluble. No es silencioso: BetterAuth loguea el
warning de arriba. Ese warning es la señal.

El middleware `[ip-debug]` ya se borró.

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

**Estado: resuelto el 11 de agosto de 2026, en el repositorio.**

Las migraciones habilitan RLS en las 14 tablas de negocio. Las de BetterAuth
(`user`, `session`, `account`, `verification`, `organization`, `member`,
`invitation`, `two_factor`) son `pgTable` en el schema `public` y quedan afuera.

Medido sobre una base migrada desde cero el 8 de agosto de 2026: de 22 tablas en
`public`, 14 tienen `relrowsecurity` y `relforcerowsecurity`; las 8 restantes son
exactamente las de BetterAuth.

En Supabase la Data API (PostgREST) se expone sobre `public` por defecto y los
roles `anon`/`authenticated` reciben grants por default privileges. Con la anon
key —que es pública por diseño— eso implicaría **tokens de sesión y hashes de
contraseña legibles por HTTPS**.

La primera mitigación fue desactivar la Data API entera, ya que el frontend
nunca usa `supabase-js`. En `erp-dev` se hizo **desde el formulario de
creación**, que es mejor que apagarla después: nunca existió una ventana con
las tablas expuestas.

Pero eso dejaba la protección en un checkbox del dashboard. La solución
definitiva es la migración **`0009_revocar_data_api_en_auth.sql`**, que le quita
a `anon` y `authenticated` todo permiso sobre las ocho tablas de auth y, con un
`ALTER DEFAULT PRIVILEGES`, hace que las tablas futuras nazcan igual. Ahora la
protección vive en el repositorio y viaja sola a cada entorno nuevo: aunque
alguien encienda la Data API, PostgREST recibe un permiso denegado.

No se usa RLS sobre esas tablas a propósito: el backend legítimamente necesita
leerlas y escribirlas con `erp_app`, y RLS sin políticas lo dejaría afuera —
nadie podría iniciar sesión. El `REVOKE` dice exactamente lo que se quiere
decir.

Los roles `anon` y `authenticated` los crea la plataforma y no existen en el
Postgres local ni en el del CI, así que la migración va envuelta en un chequeo
de existencia. Verificado en los dos escenarios: con los roles presentes, las
ocho tablas quedan sin `SELECT` para ambos y una tabla creada después tampoco
lo recibe, mientras `erp_app` conserva lectura y escritura; sin los roles, la
migración aplica igual y los 83 tests pasan contra esa base.

Aplicada en `erp-dev` el 11 de agosto de 2026, junto con la `0010`.

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
