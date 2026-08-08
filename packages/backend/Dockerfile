# Backend del ERP: proceso Express de larga duración, NO serverless.
# El contexto de build es la RAÍZ del monorepo, no este directorio:
#   docker build -f packages/backend/Dockerfile .
# En Railway: Root Directory = / y Dockerfile Path = packages/backend/Dockerfile

FROM node:24-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Los manifiestos van primero para que la capa de dependencias quede cacheada
# mientras no cambie ningún package.json. Se copian los de TODOS los packages
# del workspace: pnpm valida el lockfile contra la lista completa de importers,
# aunque después sólo instale los del filtro.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/design-system/package.json packages/design-system/
COPY packages/arca/package.json packages/arca/

# `@erp/backend...` = el package y sus dependencias del workspace (@erp/core).
# --prod deja afuera drizzle-kit y vitest: las migraciones se aplican a mano
# desde la máquina del desarrollador, no desde el contenedor.
RUN pnpm install --frozen-lockfile --prod --filter @erp/backend...

# Sólo el código que el backend necesita en runtime. @erp/core se consume como
# TypeScript crudo (exporta ./src/index.ts), por eso viaja completo.
COPY packages/core packages/core
COPY packages/backend packages/backend

ENV NODE_ENV=production

# Informativo: Railway inyecta su propio PORT y src/index.ts lo respeta.
EXPOSE 3001

# tsx transpila en memoria al arrancar. No hay paso de compilación.
CMD ["pnpm", "--filter", "@erp/backend", "start"]
