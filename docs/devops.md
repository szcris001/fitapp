# DevOps — FitHub

Fecha de creacion: 2026-05-05

---

## Ambientes

| Ambiente | Proposito | Trigger |
|---|---|---|
| dev | Local con Docker Compose | Manual |
| staging | (pendiente de configurar) | Push a `develop` |
| production | Deploy aprobado | Push a `master` + aprobacion manual |

---

## GitHub Actions

### `.github/workflows/ci.yml`

Corre en cada push a cualquier rama y en PRs a `master`.

| Job | Que hace | Dependencias |
|---|---|---|
| `lint` | pnpm lint en la raiz | ninguna |
| `test-api` | Genera Prisma client + pnpm test en apps/api | ninguna |
| `build-api` | tsc en apps/api | test-api (debe pasar primero) |
| `build-web` | pnpm build en apps/web | ninguna |

Los tests de API usan mocks de Prisma — no necesitan PostgreSQL real en CI.

### `.github/workflows/deploy.yml`

Corre solo en push a `master`. Requiere aprobacion manual via GitHub Environments.

**Configurar aprobacion manual:**
1. Ir a Settings > Environments en el repo de GitHub
2. Crear environment llamado `production`
3. En "Required reviewers" agregar tu usuario de GitHub
4. El workflow quedara pausado hasta que alguien apruebe en el PR

Actualmente tiene placeholders. Descomentar el bloque correspondiente segun la plataforma elegida:
- Railway: requiere `RAILWAY_TOKEN` en GitHub Secrets
- Render: requiere `RENDER_DEPLOY_HOOK_API` en GitHub Secrets
- VPS: requiere `SSH_HOST`, `SSH_USER`, `SSH_KEY` en GitHub Secrets

---

## Infraestructura local (desarrollo)

```bash
docker compose up -d        # Levanta Postgres 16 (5432) + Redis 7 (6379)
cd apps/api && pnpm dev     # API en http://localhost:3001
cd apps/web && pnpm dev     # Web en http://localhost:3000
```

---

## Infraestructura de produccion (VPS con Docker)

Archivo: `docker-compose.prod.yml`

Servicios:
- `postgres` — PostgreSQL 16, volumen persistente, no expuesto al exterior
- `redis` — Redis 7 con password, volumen persistente, no expuesto al exterior
- `api` — Fastify, imagen desde `apps/api/Dockerfile` (contexto: raíz del monorepo). Corre como `node`; al arrancar migra con `DATABASE_ADMIN_URL`, habilita `fitapp_app` y lanza la API sin las credenciales de admin. Uploads en el volumen `/app/apps/api/uploads`.
- `web` — Next.js standalone, imagen desde `apps/web/Dockerfile` (contexto: raíz). `NEXT_PUBLIC_API_URL` se pasa como build arg; el contenedor no recibe secretos del backend.
- `nginx` — Reverse proxy, SSL con Let's Encrypt
- `certbot` — Renovacion automatica de certificados

Comandos:
```bash
# Primera vez
cp .env.production.example .env.production
# editar .env.production (no se versiona: está en .gitignore)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# Deploy manual
bash scripts/deploy.sh

# Ver logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api

# Build de una imagen suelta (siempre desde la raíz)
docker build -f apps/api/Dockerfile -t fitapp-api .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.dominio.com/api -t fitapp-web .
```

**IMPORTANTE:** Editar `nginx/nginx.conf` y reemplazar `dominio.com` con el dominio real antes del primer deploy.

---

## Variables de entorno

Ver `.env.production.example` para la lista completa con descripciones.

### Donde configurar cada variable

| Contexto | Donde configurar |
|---|---|
| CI (tests, build) | GitHub Secrets (Settings > Secrets > Actions) |
| Deploy API en Railway | Dashboard de Railway > Variables |
| Deploy API en Render | Dashboard de Render > Environment |
| Deploy Web en Vercel | Dashboard de Vercel > Environment Variables |
| VPS con Docker | `.env.production` en el servidor (no en git) |

### Variables minimas para que CI pase

Estas se configuran en GitHub Secrets:
- `DATABASE_URL` — puede ser una URL ficticia, los tests usan mocks
- `JWT_SECRET` — cualquier string, solo para que no falle el process.env
- `STRIPE_SECRET_KEY` — `sk_test_placeholder` alcanza para CI
- `ANTHROPIC_API_KEY` — `sk-ant-placeholder` alcanza para CI

### Variables criticas de produccion (NUNCA commitear)

- `JWT_SECRET` — si se filtra, un atacante puede forjar tokens de cualquier gym
- `DATABASE_URL` — acceso completo a la base de datos
- `STRIPE_SECRET_KEY` (live) — puede generar cargos reales
- `ANTHROPIC_API_KEY` — costo por uso

---

## Sentry (monitoreo de errores)

Estado: **preparado, pendiente de instalar**.

Archivos:
- `apps/api/src/lib/sentry.ts` — inicializacion con instrucciones comentadas
- `.env.production.example` — incluye `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN`

Para activar:
1. Crear proyecto en https://sentry.io (tipo Node.js para API, Next.js para Web)
2. Copiar DSN a las variables de entorno correspondientes
3. Ejecutar: `pnpm --filter @fitapp/api add @sentry/node`
4. Descomentar el codigo en `apps/api/src/lib/sentry.ts`
5. Llamar `initSentry()` al inicio de `apps/api/src/index.ts`
6. Para Web: seguir la guia oficial de Sentry para Next.js App Router

Errores estaran taggeados por `gymId` para filtrar por tenant en el dashboard.

---

## Health checks

- `GET /health` — respuesta rapida 200 `{ status: 'ok' }`
- `GET /healthz` — valida conexion a Postgres antes de responder 200

El nginx y Docker usan `/healthz`. Las plataformas gestionadas (Railway, Render) pueden configurarse para usar cualquiera de los dos.

---

## Dockerfiles (creados 2026-06-15)

Ambos Dockerfiles fueron creados con builds multi-stage:

- `apps/api/Dockerfile` — deps → builder (tsc + prisma generate) → runner. CMD: `prisma migrate deploy && node dist/index.js`
- `apps/web/Dockerfile` — deps → builder (next build) → runner (next standalone). Requiere `ARG NEXT_PUBLIC_API_URL` en build time.

Railway los detecta y construye automaticamente desde GitHub.

---

## Script de deploy manual

`scripts/deploy.sh` — Para VPS. Pasos:
1. `git reset --hard origin/master`
2. `pnpm install --frozen-lockfile`
3. `docker compose build` (si no se pasa `--skip-build`)
4. `prisma migrate deploy` (dentro del contenedor)
5. `docker compose up -d`

---

## Plan de despliegue — Railway + Cloudflare (decidido 2026-06-15)

### Arquitectura elegida

| Servicio | Plataforma | Costo aprox. |
|---|---|---|
| API (Fastify) | Railway — servicio Docker | ~$5 USD/mes |
| Web (Next.js) | Railway — servicio Docker | ~$5 USD/mes |
| PostgreSQL 16 | Railway — plugin Postgres | ~$5 USD/mes |
| Redis 7 | Railway — plugin Redis | ~$3 USD/mes |
| Dominio + DNS + CDN | Cloudflare | ~$10-15 USD/año |
| **Total estimado** | | **~$20 USD/mes** |

### Pasos para el primer deploy (acciones de Cristian)

#### 1. Crear proyecto en Railway
1. Ir a https://railway.app → New Project
2. Agregar 4 servicios: PostgreSQL, Redis, API (Docker), Web (Docker)
3. Conectar el repositorio de GitHub al proyecto

#### 2. Configurar variables de entorno en Railway

**API Service → Variables**:
```
NODE_ENV=production
JWT_SECRET=cb2f24e2fdd333db1fd4a0b4515ce961299e30a7f4e35960ad4899730a3ef5a9
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PORT=3001
FRONTEND_URL=https://app.tudominio.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

**Web Service → Variables**:
```
NEXT_PUBLIC_API_URL=https://api.tudominio.com/api
```

**Web Service → Build Arguments** (necesario para Next.js en build time):
```
NEXT_PUBLIC_API_URL=https://api.tudominio.com/api
```

#### 3. Configurar dominios en Railway
- API Service: agregar dominio custom → `api.tudominio.com`
- Web Service: agregar dominio custom → `app.tudominio.com`

#### 4. Apuntar DNS en Cloudflare
- Crear registro CNAME `api` → URL interna de Railway
- Crear registro CNAME `app` → URL interna de Railway
- Activar proxy Cloudflare (nube naranja) para CDN + DDoS protection

#### 5. Mobile app — antes de publicar en stores
Actualizar URL hardcodeada en `apps/mobile/src/lib/api.ts`:
```ts
// Cambiar de IP local a:
baseURL: 'https://api.tudominio.com/api'
```

Luego configurar EAS Build (Expo Application Services) para generar los binarios:
```bash
npm install -g eas-cli
eas login
eas build --platform android   # Google Play ($25 one-time)
eas build --platform ios       # App Store (Apple Developer $99/año)
```

### GitHub Actions → Railway

Para activar deploy automático desde CI:
1. Obtener `RAILWAY_TOKEN` desde Railway → Account → API Tokens
2. Agregarlo en GitHub → Settings → Secrets → Actions
3. Descomentar el bloque Railway en `.github/workflows/deploy.yml`

---

## Pendientes

- [x] Elegir plataforma de backend: **Railway** (decidido 2026-06-15)
- [x] Crear `apps/api/Dockerfile` y `apps/web/Dockerfile` (completado 2026-06-15)
- [ ] Crear proyecto en Railway y configurar 4 servicios
- [ ] Configurar variables de entorno en Railway (ver seccion arriba)
- [ ] Comprar dominio en Cloudflare y apuntar DNS
- [ ] Configurar environment `production` en GitHub con aprobacion manual
- [ ] Crear proyecto en Sentry y obtener DSN
- [ ] Actualizar URL de API en apps/mobile antes de publicar en stores
- [ ] Configurar EAS Build para Google Play y App Store
- [x] RLS aplicado: la API se conecta como `fitapp_app` (`DATABASE_URL`); migraciones con `DATABASE_ADMIN_URL`; `APP_DB_PASSWORD` para `setup-app-db-role` (ver docs/SECURITY.md §7)
- [ ] Configurar staging: rama `develop` + environment separado en Railway
