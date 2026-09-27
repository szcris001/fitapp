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

WORKDIR /app/apps/api
# uploads/ es relativo al cwd: montar el volumen persistente en /app/apps/api/uploads
RUN mkdir -p uploads/avatars uploads/assets uploads/evidence uploads/receipts && chown -R node:node uploads
USER node

EXPOSE 3001

# Migraciones y rol de la app con el usuario admin; la API arranca SIN las credenciales
# de admin en su entorno (solo DATABASE_URL = rol fitapp_app, sujeto a RLS)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/scripts/setup-app-db-role.js && exec env -u DATABASE_ADMIN_URL -u APP_DB_PASSWORD node dist/index.js"]
