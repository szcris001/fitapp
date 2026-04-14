#!/bin/bash

# Obtiene la IP local de la red Wi-Fi (excluye loopback y Docker)
NEW_IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | grep -v "172\." | awk '{print $2}' | cut -d'/' -f1 | head -1)

if [ -z "$NEW_IP" ]; then
  echo "❌ No se encontró una IP de red local. ¿Estás conectado al Wi-Fi?"
  exit 1
fi

FILE="apps/mobile/src/lib/api.ts"

# Reemplaza cualquier IP en la URL del API
sed -i "s|http://[0-9.]*:3001/api|http://$NEW_IP:3001/api|g" "$FILE"

echo "✅ IP actualizada a: $NEW_IP"
echo "   Archivo: $FILE"
