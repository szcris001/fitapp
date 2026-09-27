# ── Stage 1: dependencias ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copiar manifiestos del workspace (necesarios para pnpm install en monorepo)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
# Crear package.json mínimos para que pnpm resuelva el workspace correctamente
RUN mkdir -p apps/web apps/mobile && \
    echo '{"name":"@fitapp/web","version":"0.0.0"}' > apps/web/package.json && \
    echo '{"name":"@fitapp/mobile","version":"0.0.0"}' > apps/mobile/package.json

RUN pnpm install --frozen-lockfile --filter @fitapp/api...

# ── Stage 2: build TypeScript ─────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY apps/api ./apps/api

# Generar Prisma Client y compilar TypeScript
RUN cd apps/api && \
    pnpm prisma generate && \
    pnpm build

# ── Stage 3: imagen de producción ─────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production

# Copiar solo lo necesario para producción
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/src/generated/prisma ./src/generated/prisma
COPY --from=builder /app/apps/api/prisma ./prisma
# Prisma 7 toma la URL de migración de prisma.config.ts (DATABASE_ADMIN_URL)
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./package.json

# Directorio de uploads persistente (montar como volumen en producción)
RUN mkdir -p /app/uploads/avatars /app/uploads/assets

EXPOSE 3001

# Ejecutar migraciones pendientes y arrancar
# Migraciones y rol de la app con el usuario admin; la API arranca SIN las credenciales
# de admin en su entorno (solo DATABASE_URL = rol fitapp_app, sujeto a RLS)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/scripts/setup-app-db-role.js && exec env -u DATABASE_ADMIN_URL -u APP_DB_PASSWORD node dist/index.js"]
