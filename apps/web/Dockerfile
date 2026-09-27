# Build desde la raíz del monorepo:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .

# ── Stage 1: dependencias ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
# Manifiestos reales del resto del workspace: el lockfile los incluye
COPY apps/api/package.json ./apps/api/
COPY apps/mobile/package.json ./apps/mobile/

RUN pnpm install --frozen-lockfile --filter @fitapp/web...

# ── Stage 2: build Next.js ────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY apps/web ./apps/web

# Variables de entorno necesarias en build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN cd apps/web && pnpm build

# ── Stage 3: imagen de producción (standalone) ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output incluye su propio node_modules mínimo
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
