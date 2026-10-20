# Build desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile .
# (docker-compose.prod.yml ya usa context: . — el lockfile y el workspace viven en la raíz)

# ── Stage 1: dependencias ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
# Misma versión que "packageManager" del package.json raíz (el lockfile la exige)
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Manifiestos reales de todo el workspace: el lockfile incluye api, web y mobile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/

RUN pnpm install --frozen-lockfile --filter @fitapp/api...

# ── Stage 2: build TypeScript ─────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY apps/api ./apps/api
RUN cd apps/api && pnpm prisma generate && pnpm build

# ── Stage 3: imagen de producción ─────────────────────────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Se conserva la estructura del workspace: pnpm enlaza apps/api/node_modules/* hacia
# /app/node_modules/.pnpm, y la API resuelve sus dependencias desde apps/api
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/apps/api/package.json /app/apps/api/prisma.config.ts ./apps/api/
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
# prisma/seed.ts corre con ts-node contra el código fuente (no contra dist/) e importa
# '../src/generated/prisma' — sin esto, el seed falla en cada arranque con
# "Cannot find module '../src/generated/prisma'" (silencioso, ver CMD abajo: no
# bloquea el arranque). Encontrado 2026-10-19: producción nunca tuvo benchmarks ni
# movimientos sembrados pese al fix de PR #118.
COPY --from=builder --chown=node:node /app/apps/api/src/generated ./apps/api/src/generated

# fixtures.json del entorno QA: seed-qa.ts lo resuelve con __dirname relativo a la raíz
# del monorepo (/app/qa/fixtures.json), que esta imagen no trae por defecto. Sin esto,
# `node dist/scripts/seed-qa.js` falla con ENOENT en cualquier entorno (p. ej. staging
# vía preDeployCommand) que no sea un checkout completo del repo.
COPY --chown=node:node qa/fixtures.json ./qa/fixtures.json

WORKDIR /app/apps/api
# uploads/ es relativo al cwd: montar el volumen persistente en /app/apps/api/uploads
RUN mkdir -p uploads/avatars uploads/assets uploads/evidence uploads/receipts && chown -R node:node uploads
# su-exec para bajar privilegios en el CMD (ver nota abajo): el contenedor arranca
# como root únicamente para corregir el dueño del volumen, no para correr la app
RUN apk add --no-cache su-exec

EXPOSE 3001

# Arranca como root (sin USER): un volumen montado en runtime llega con su propio dueño
# (normalmente root), que pisa el chown hecho arriba en build time — sin esto, mkdir
# dentro de uploads/ falla con EACCES en cualquier plataforma que monte un volumen ahí.
# Se corrige el dueño en cada arranque y recién ahí se baja a "node" con su-exec para
# correr migraciones, crear el rol de la app y lanzar el servidor sin privilegios.
#
# prisma/seed.ts siembra los 113 benchmarks oficiales (Fran, Grace, Murph, los Open...)
# y el catálogo de movimientos: son globales (gymId null, visibles para todos los gyms
# vía el OR en GET /benchmarks), no hace falta repetirlo por gym — pero antes era 100%
# manual y nunca se había corrido contra producción (Cristian, 2026-10-17: "no veo los
# benchmarks"). Corre acá en cada arranque: es un upsert por externalId, así que
# repetirlo en cada deploy es gratis. No bloquea el arranque si falla — es contenido de
# referencia, no algo de lo que dependa que el server levante.
#
# Corre la versión YA COMPILADA (prisma/seed.js, generada en el build por
# tsconfig.seed.json — ver package.json#build), no `ts-node prisma/seed.ts` directo:
# encontrado 2026-10-19 que esta imagen nunca tuvo `src/generated/prisma` copiado (TS2307
# "Cannot find module" en cada deploy, silencioso) y que, aun corrigiendo eso, ts-node
# 10.9.2 choca con el package.json ESM/CJS dual del cliente de Prisma 7 generado
# (ERR_UNKNOWN_FILE_EXTENSION) — compilar en el build evita ambos problemas de raíz.
CMD ["sh", "-c", "chown -R node:node uploads && exec su-exec node sh -c 'npx prisma migrate deploy && node dist/scripts/setup-app-db-role.js && (node prisma/seed.js || echo \"[seed] benchmarks oficiales: fallo, revisar logs\") && exec env -u DATABASE_ADMIN_URL -u APP_DB_PASSWORD node dist/index.js'"]
