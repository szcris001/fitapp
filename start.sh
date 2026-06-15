#!/usr/bin/env bash
# start.sh — Levanta todos los servicios de FitApp limpiamente
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[fitapp]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; }

PORTS=(3000 3001 8081 8082 19000 19001 19002)

# ── Modo ───────────────────────────────────────────────────────────────────────
WITH_MOBILE=false
if [[ "$1" == "--mobile" || "$1" == "-m" ]]; then
  WITH_MOBILE=true
fi

# ── 1. Liberar puertos ─────────────────────────────────────────────────────────
log "Liberando puertos..."
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -ti ":$PORT" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo -n "  Puerto $PORT → matando PID(s) $PIDS ... "
    kill -9 $PIDS 2>/dev/null || true
    sleep 0.3
    echo "listo"
  fi
done

# Matar cualquier proceso nodemon / next / expo huérfano
pkill -9 -f "nodemon" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "expo start" 2>/dev/null || true
sleep 0.5
ok "Puertos liberados"

# ── 2. Docker (PostgreSQL + Redis) ─────────────────────────────────────────────
log "Verificando Docker..."

# Asegurar restart automático en futuros reinicios del sistema
docker update --restart=unless-stopped fitapp_db fitapp_redis > /dev/null 2>&1 || true

DB_RUNNING=$(docker ps -q -f name=fitapp_db 2>/dev/null)
REDIS_RUNNING=$(docker ps -q -f name=fitapp_redis 2>/dev/null)

if [[ -z "$DB_RUNNING" || -z "$REDIS_RUNNING" ]]; then
  warn "Contenedores no están corriendo. Iniciando..."
  cd /home/cristiansilva/fitapp
  docker compose up -d
fi

log "Esperando que PostgreSQL esté listo..."
for i in $(seq 1 20); do
  if docker exec fitapp_db pg_isready -U fitapp -q 2>/dev/null; then
    ok "PostgreSQL + Redis corriendo"
    break
  fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    err "PostgreSQL no respondió a tiempo"
    exit 1
  fi
done

# ── 3. Crear directorio de logs ────────────────────────────────────────────────
LOGDIR="/tmp/fitapp-logs"
mkdir -p "$LOGDIR"

# ── 4. API (puerto 3001) ───────────────────────────────────────────────────────
log "Iniciando API (puerto 3001)..."
cd /home/cristiansilva/fitapp/apps/api
nohup pnpm dev > "$LOGDIR/api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$LOGDIR/api.pid"

# Esperar a que la API responda
for i in $(seq 1 20); do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1 || \
     grep -q "Server.*3001\|listening\|started" "$LOGDIR/api.log" 2>/dev/null; then
    ok "API corriendo (PID $API_PID)"
    break
  fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    warn "API tardando en iniciar, revisa: tail -f $LOGDIR/api.log"
  fi
done

# ── 5. Web (puerto 3000) ───────────────────────────────────────────────────────
log "Iniciando Web (puerto 3000)..."
cd /home/cristiansilva/fitapp/apps/web
nohup pnpm dev > "$LOGDIR/web.log" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$LOGDIR/web.pid"

# Esperar a que Next.js compile
for i in $(seq 1 30); do
  if grep -q "Ready\|started server\|Local:" "$LOGDIR/web.log" 2>/dev/null; then
    ok "Web corriendo (PID $WEB_PID)"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    warn "Web tardando en compilar, revisa: tail -f $LOGDIR/web.log"
  fi
done

# ── 6. Móvil (Expo, opcional) ──────────────────────────────────────────────────
if [[ "$WITH_MOBILE" == true ]]; then
  log "Iniciando Expo (puerto 8081)..."
  cd /home/cristiansilva/fitapp/apps/mobile
  # Abrir en nueva terminal si es posible, si no en background
  if command -v gnome-terminal &>/dev/null; then
    gnome-terminal -- bash -c "cd /home/cristiansilva/fitapp/apps/mobile && pnpm exec expo start --host lan --port 8081 --clear; exec bash" &
  elif command -v xterm &>/dev/null; then
    xterm -e "cd /home/cristiansilva/fitapp/apps/mobile && pnpm exec expo start --host lan --port 8081 --clear" &
  else
    # Sin GUI: lanzar en background con log
    nohup pnpm exec expo start --host lan --port 8081 --clear > "$LOGDIR/mobile.log" 2>&1 &
    EXPO_PID=$!
    echo $EXPO_PID > "$LOGDIR/mobile.pid"
    warn "Expo en background (PID $EXPO_PID) — QR en: tail -f $LOGDIR/mobile.log"
  fi
fi

# ── 7. Resumen ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  FitApp corriendo${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  API  → http://localhost:3001"
echo -e "  Web  → http://localhost:3000"
[[ "$WITH_MOBILE" == true ]] && echo -e "  Expo → http://localhost:8081"
echo ""
echo -e "  Logs:"
echo -e "    tail -f $LOGDIR/api.log"
echo -e "    tail -f $LOGDIR/web.log"
[[ "$WITH_MOBILE" == true ]] && echo -e "    tail -f $LOGDIR/mobile.log"
echo ""
echo -e "  Para detener todo:  ./stop.sh"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
