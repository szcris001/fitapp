# DevOps — FitHub

Fecha de creacion: 2026-05-05

---

## Ambientes

| Ambiente | Proposito | Trigger |
|---|---|---|
| dev | Local con Docker Compose | Manual |
| staging | Railway, proyecto `patient-serenity` / environment `staging` | Auto desde `master` via GitHub App de Railway |
| production | Railway, proyecto `patient-serenity` / environment `production` | Auto desde `master` via GitHub App de Railway (no via `.github/workflows/deploy.yml`, ver abajo) |

**Nota:** la plataforma real en uso hoy es **Railway**, no el VPS con `docker-compose.prod.yml` descripto mas abajo en este documento (ese plan quedo sin ejecutar). El proyecto Railway `patient-serenity` tiene 4 servicios en cada ambiente: `api`, `web`, `Postgres`, `Redis`. El despliegue es automatico desde el push a `master` por la integracion GitHub App de Railway, **no** por `.github/workflows/deploy.yml` (ese workflow sigue con placeholders y sin `RAILWAY_TOKEN`, no hace nada hoy).

URLs de producción (ver `.env.production` local, no versionado):
- API: `https://api-production-ff3c.up.railway.app` (`/health`, `/healthz`)
- Web: `https://web-production-1f7d5.up.railway.app`

IDs útiles: proyecto `patient-serenity` = `64161894-1b63-4c8f-a4bf-bd2053107bd9`; ambiente `production` = `61e71eba-8ac0-4554-b4db-fed704b56121`; ambiente `staging` = `9d9806e0-7815-4e75-9797-4d3d7ddc8b13`; servicio `api` = `32108344-0f12-4de8-a2d6-06af27248bfc`; servicio `web` = `3f97b4a9-9fa3-4233-bba1-d5669ec926e5` (mismo `serviceId` en ambos ambientes).

CLI: `railway status` (requiere `railway link` una vez por máquina; usar `railway environment <nombre>` / `railway service <nombre>` para cambiar de ambiente/servicio activo).

### Incidente 2026-10-08/2026-10-12 — producción desincronizada de `master` + fix de auto-deploy (CERRADO)

Al sacar las URLs reales el 2026-10-08 se encontró que producción corría commits de más de un mes atrás (API en PR #43, web en un commit aún anterior), pese a decenas de merges posteriores a `master` (HEAD en PR #89). Causa raíz: `serviceInstanceAutoDeployStatus` (GraphQL de Railway) devolvía `enabled: false, canEnable: true` en los 4 pares servicio/ambiente — el repo estaba conectado (`source.repo`, `hasEverDeployed: true`) pero el auto-deploy nunca se había activado.

Resuelto el 2026-10-12 (Cristian, desde su propia terminal — las escrituras contra producción están bloqueadas para el agente devops por el sandbox de Claude Code):
1. Redeploy manual de `api` y de `web` a `master` vía el botón Deploy/Redeploy del dashboard.
2. `railway service source connect --repo szcris001/fitapp --branch master --service <api|web> --environment <production|staging>` en los 4 pares — recrea el deployment trigger (lo que realmente faltaba) y disparó un redeploy adicional en cada uno.

Verificado tras el fix: `api` y `web` de producción en commit `8fa8df5c67f9115bd797f35d2cf31070006364bf` (= `master` HEAD, PR #89), `status: SUCCESS`; `serviceInstanceAutoDeployStatus.enabled = true` en los 4 pares. No debería volver a desincronizarse — si pasa, repetir el `source connect` de arriba (no basta con el toggle solo).

Para confirmar el commit real desplegado (no asumir por fecha):
```bash
railway api 'query { deployment(id: "<deployment id de railway status>") { status meta } }'   # meta.commitHash, meta.branch
railway api 'query { serviceInstanceAutoDeployStatus(environmentId: "<env>", projectId: "64161894-1b63-4c8f-a4bf-bd2053107bd9", serviceId: "<service>") { enabled canEnable reason } }'
```

Pendiente, no bloqueante: confirmar en el dashboard si las pasarelas de pago (`STRIPE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `FINTOC_API_KEY`, etc.) de producción están en modo live o test — `railway variables` quedó bloqueado para el agente por el sandbox tanto en lectura de valores como en `--help`.

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

> Los pasos de abajo están automatizados como wizard interactivo en
> `scripts/deploy-railway-wizard.sh` — corre `bash scripts/deploy-railway-wizard.sh` desde
> la raíz del repo y te va guiando pantalla por pantalla, generando los secretos y
> verificando cada servicio con curl. Esta sección queda como referencia de lo que hace.

#### 1. Crear proyecto en Railway
1. Ir a https://railway.app → New Project
2. Agregar 4 servicios: PostgreSQL, Redis, API (Docker), Web (Docker)
3. Conectar el repositorio de GitHub al proyecto

#### 2. Configurar variables de entorno en Railway

**API Service → Variables**:

> ⚠️ **RLS (desde 2026-09-27):** `${{Postgres.DATABASE_URL}}` es la conexión de
> **superusuario** del plugin de Railway. Usarla como `DATABASE_URL` haría que la API
> corriera sin RLS — el mismo riesgo que se cerró en `20260927010000_rls_enforced`
> (ver `docs/SECURITY.md` §7). `DATABASE_ADMIN_URL` sí es esa conexión de superusuario
> (la usa el `CMD` del Dockerfile solo para migrar y crear el rol `fitapp_app`, y la
> API arranca sin ella). `DATABASE_URL` se arma aparte con el rol `fitapp_app` y un
> password propio, usando las variables sueltas que expone el plugin (`PGHOST`,
> `PGPORT`, `PGDATABASE`), no la `DATABASE_URL` completa del plugin.

```
NODE_ENV=production
JWT_SECRET=cb2f24e2fdd333db1fd4a0b4515ce961299e30a7f4e35960ad4899730a3ef5a9
DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
APP_DB_PASSWORD=<generar con: openssl rand -hex 24>
DATABASE_URL=postgresql://fitapp_app:${{APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
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

**API Service → Volume:** montar un volumen persistente en `/app/apps/api/uploads`.
Sin esto, avatares, logos y comprobantes de transferencia se pierden en cada redeploy
(el filesystem del contenedor es efímero).

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
- [x] Crear proyecto en Railway y configurar 4 servicios (api, web, Postgres, Redis —
      completado 2026-10-02; URLs: ver RAILWAY_API_URL/RAILWAY_WEB_URL en .env.production local)
- [x] Configurar variables de entorno en Railway (completado 2026-10-02)
- [x] Montar volumen persistente en el servicio API (`/app/apps/api/uploads`) — completado
      2026-10-02, requirió el fix de permisos en `apps/api/Dockerfile` (PR #42)
- [ ] Comprar dominio en Cloudflare y apuntar DNS
- [x] Configurar environment `production` en GitHub con aprobacion manual (completado
      2026-10-02: required reviewer = szcris001). Falta el secret `RAILWAY_TOKEN` para
      activar el bloque de deploy en `deploy.yml` — el modo automático de Claude Code
      bloquea la creación de tokens/secrets, así que ese paso lo genera Cristian
      (Railway dashboard → Tokens) y lo sube con `gh secret set RAILWAY_TOKEN`
- [ ] Crear proyecto en Sentry y obtener DSN
- [ ] Actualizar URL de API en apps/mobile antes de publicar en stores
- [ ] Configurar EAS Build para Google Play y App Store
- [x] RLS aplicado: la API se conecta como `fitapp_app` (`DATABASE_URL`); migraciones con `DATABASE_ADMIN_URL`; `APP_DB_PASSWORD` para `setup-app-db-role` (ver docs/SECURITY.md §7)
- [ ] Configurar staging: ambiente separado dentro del mismo proyecto de Railway
      (Environments — disponible en el plan Hobby, no requiere plan superior). Cada
      ambiente corre su propia copia de los 4 servicios (Postgres/Redis/API/Web) y su
      propio consumo/costo. Sirve además para probar webhooks de pasarelas (Stripe,
      Mercado Pago, Fintoc), que necesitan una URL pública real — hoy no se puede
      probar bien en local. (2026-10-01, pendiente de decidir cuándo armarlo)
- [ ] Prueba de carga antes de sumar muchos gyms reales a producción: no se ha hecho
      ninguna. La arquitectura es multi-tenant sin límite de gyms en el código (todo
      queda filtrado por `gymId` + RLS), así que el techo real es de infraestructura
      (CPU/RAM de la instancia de Postgres y del contenedor de la API en Railway), no
      de la app. Hacerla contra el ambiente de Railway una vez armado — no tiene
      sentido contra local. (2026-10-01, pedido por Cristian)
