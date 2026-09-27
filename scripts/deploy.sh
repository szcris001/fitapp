#!/usr/bin/env bash
# scripts/deploy.sh — Deploy manual en VPS con Docker Compose
#
# Uso:
#   bash scripts/deploy.sh            # deploy completo
#   bash scripts/deploy.sh --skip-build  # solo migraciones + restart
#
# Requisitos en el servidor:
#   - Docker + Docker Compose v2 instalados
#   - .env.production con valores reales en /opt/fithub/
#   - El usuario que corre el script debe estar en el grupo docker
#
# En plataformas gestionadas (Railway, Render, Vercel) este script NO aplica.
# Esas plataformas hacen el deploy automáticamente con su propia infraestructura.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fithub}"
COMPOSE_FILE="docker-compose.prod.yml"
# --env-file: las ${VARIABLES} del compose (DB_USER, APP_DB_PASSWORD, NEXT_PUBLIC_API_URL…)
COMPOSE="docker compose --env-file .env.production -f $COMPOSE_FILE"
SKIP_BUILD="${1:-}"

echo "=== FitHub Deploy ==="
echo "Directorio: $APP_DIR"
echo "Fecha: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

cd "$APP_DIR"

# ─── 1. Actualizar código ────────────────────────────────────────────────────
echo ""
echo "--- [1/5] Actualizando codigo desde git..."
git fetch origin master
git reset --hard origin/master
echo "Commit actual: $(git rev-parse --short HEAD)"

# ─── 2. Instalar dependencias ────────────────────────────────────────────────
echo ""
echo "--- [2/5] Instalando dependencias..."
# pnpm debe estar en el host (versión de "packageManager": corepack enable)
pnpm install --frozen-lockfile

# ─── 3. Build de imágenes Docker ─────────────────────────────────────────────
if [ "$SKIP_BUILD" != "--skip-build" ]; then
    echo ""
    echo "--- [3/5] Construyendo imagenes Docker..."
    $COMPOSE build --no-cache api web
else
    echo ""
    echo "--- [3/5] Build omitido (--skip-build)"
fi

# ─── 4. Migraciones de base de datos ─────────────────────────────────────────
echo ""
echo "--- [4/5] Aplicando migraciones de Prisma..."
# Correr las migraciones dentro del contenedor de API antes de reiniciarlo.
# Si la DB no está up todavía, levantar solo postgres primero.
$COMPOSE up -d postgres redis
sleep 5  # Dar tiempo al healthcheck de postgres

# DATABASE_ADMIN_URL y APP_DB_PASSWORD vienen del environment del servicio api (compose)
$COMPOSE run --rm api \
    sh -c "npx prisma migrate deploy && node dist/scripts/setup-app-db-role.js"

echo "Migraciones aplicadas."

# ─── 5. Reiniciar servicios ───────────────────────────────────────────────────
echo ""
echo "--- [5/5] Reiniciando servicios..."
$COMPOSE up -d --remove-orphans

echo ""
echo "=== Deploy completado ==="
echo "Verificar estado: docker compose -f $COMPOSE_FILE ps"
echo "Ver logs API:     docker compose -f $COMPOSE_FILE logs -f api"
echo "Health check:     curl https://api.dominio.com/health"
echo ""
echo "IMPORTANTE: Reemplazar 'api.dominio.com' con tu dominio real."
