#!/usr/bin/env bash
# Deploy Hills Lite Cloud on the VPS. Generates secrets on first run, then brings
# up the docker compose stack (Postgres + API). Idempotent-ish: keeps existing .env.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  ADMIN_PW="$(openssl rand -hex 8)"
  {
    echo "APP_PORT=8090"
    echo "HOST=0.0.0.0"
    echo "PORT=8080"
    echo "CORS_ORIGIN=*"
    echo "DATABASE_URL=postgres://emby:emby@db:5432/emby_cloud"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "JWT_EXPIRES_IN=30d"
    echo "EMBY_ENC_KEY=$(openssl rand -hex 32)"
    echo "CODE_SIGN_SECRET=$(openssl rand -hex 32)"
    echo "ADMIN_USERNAME=admin"
    echo "ADMIN_PASSWORD=$ADMIN_PW"
  } > .env
  echo "GENERATED_ADMIN_PASSWORD=$ADMIN_PW"
else
  echo "ENV_EXISTS keeping existing .env"
fi

docker compose up -d --build
echo "DEPLOY_DONE"
