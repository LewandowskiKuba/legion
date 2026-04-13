#!/bin/bash
set -e
echo "◆ Deploy Synthetic Population Sandbox"

git pull origin main
docker compose build --no-cache
docker compose up -d
docker compose logs --tail=20 swarm

echo "✓ Deployed → http://$(curl -s ifconfig.me):3000"
