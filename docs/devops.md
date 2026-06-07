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
- `api` — Fastify, imagen construida desde `apps/api/Dockerfile`
- `web` — Next.js, imagen construida desde `apps/web/Dockerfile`
- `nginx` — Reverse proxy, SSL con Let's Encrypt
- `certbot` — Renovacion automatica de certificados

Comandos:
```bash
# Primera vez
cp .env.production.example .env.production
# editar .env.production
docker compose -f docker-compose.prod.yml up -d

# Deploy manual
bash scripts/deploy.sh

# Ver logs
docker compose -f docker-compose.prod.yml logs -f api
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

## Dockerfiles pendientes

Los siguientes archivos son necesarios si se usa `docker-compose.prod.yml` pero aun no existen:
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

Si se elige Railway, Render o Vercel, estos archivos no son necesarios — esas plataformas detectan el framework automaticamente (Node.js / Next.js).

---

## Script de deploy manual

`scripts/deploy.sh` — Para VPS. Pasos:
1. `git reset --hard origin/master`
2. `pnpm install --frozen-lockfile`
3. `docker compose build` (si no se pasa `--skip-build`)
4. `prisma migrate deploy` (dentro del contenedor)
5. `docker compose up -d`

---

## Pendientes (bloqueados por decision de Cristian)

- [ ] Elegir plataforma de backend: Railway / Render / VPS
- [ ] Elegir plataforma de web: Vercel (recomendado) / VPS
- [ ] Crear proyecto en Sentry y obtener DSN
- [ ] Configurar environment `production` en GitHub con aprobacion manual
- [ ] Crear `apps/api/Dockerfile` y `apps/web/Dockerfile` (solo si VPS)
- [ ] Configurar dominio y apuntar DNS a servidor
- [ ] Primer certificado SSL con Certbot (solo si VPS)
- [ ] Configurar staging: rama `develop` + environment separado
