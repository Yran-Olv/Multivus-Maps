#!/bin/sh
set -eu
cd /app
attempt=1
until pnpm exec tsx packages/database/src/migrate.ts; do
  if [ "$attempt" -ge 30 ]; then
    echo "Banco indisponível após ${attempt} tentativas." >&2
    exit 1
  fi
  echo "Aguardando o banco (${attempt})..."
  attempt=$((attempt + 1))
  sleep 2
done
pnpm exec tsx packages/database/src/seed.ts
exec node apps/api/dist/main.js
