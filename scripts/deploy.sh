#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh – uruchom na serwerze Hetzner (Ubuntu 22.04)
# Użycie: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/LewandowskiKuba/legion.git"
APP_DIR="/opt/legion"

echo "▶ We Are Legion – deploy script"

# ── 1. Zainstaluj Docker jeśli brak ─────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "⬇ Instaluję Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$USER"
    echo "✓ Docker zainstalowany. Uruchom skrypt ponownie po re-logowaniu."
    exit 0
fi

# ── 2. Sklonuj lub zaktualizuj repo ──────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    echo "⬇ Aktualizuję repo..."
    cd "$APP_DIR"
    git pull --ff-only
else
    echo "⬇ Klonuję repo..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 3. Sprawdź .env ───────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "⚠ Brak pliku .env!"
    echo "Skopiuj .env.example i uzupełnij:"
    echo "  cp $APP_DIR/.env.example $APP_DIR/.env"
    echo "  nano $APP_DIR/.env"
    exit 1
fi

# ── 4. Zbuduj i uruchom ───────────────────────────────────────────────────────
echo "🔨 Buduję obrazy Docker..."
docker compose build --no-cache

echo "🚀 Uruchamiam kontenery..."
docker compose up -d

# ── 5. Skopiuj frontend do nginx volume ──────────────────────────────────────
echo "📂 Kopiuję frontend do nginx volume..."
docker compose cp backend:/app/frontend-dist/. $(docker volume inspect legion_legion-frontend --format '{{.Mountpoint}}')/ 2>/dev/null || \
    docker run --rm \
        --volumes-from legion-backend \
        -v legion_legion-frontend:/dest \
        alpine sh -c "cp -r /app/frontend-dist/. /dest/"

echo ""
echo "✓ Deploy zakończony!"
echo "  Backend: http://$(curl -s ifconfig.me):80/api/health"
echo "  Frontend: http://$(curl -s ifconfig.me)/adstest/"
echo ""
echo "Aby skonfigurować HTTPS:"
echo "  docker compose --profile certbot run certbot certonly --webroot -w /var/www/certbot -d TWOJA_DOMENA"
echo "  # Następnie odkomentuj sekcję HTTPS w nginx/default.conf i: docker compose restart nginx"
