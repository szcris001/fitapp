#!/usr/bin/env bash
# stop.sh — Detiene todos los servicios de FitApp

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${CYAN}[fitapp]${NC} $*"; }
ok()  { echo -e "${GREEN}[OK]${NC} $*"; }

LOGDIR="/tmp/fitapp-logs"
PORTS=(3000 3001 8081 8082 19000 19001 19002)

log "Deteniendo servicios..."

# Matar por PID guardado
for SVC in api web mobile; do
  PIDFILE="$LOGDIR/$SVC.pid"
  if [[ -f "$PIDFILE" ]]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null && echo "  $SVC (PID $PID) detenido"
    fi
    rm -f "$PIDFILE"
  fi
done

# Matar por nombre de proceso
pkill -9 -f "nodemon" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "expo start" 2>/dev/null || true

# Liberar puertos por si quedó algo
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -ti ":$PORT" 2>/dev/null || true)
  [[ -n "$PIDS" ]] && kill -9 $PIDS 2>/dev/null || true
done

ok "Todos los servicios detenidos"
