#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

: >/app/.env

echo "[entrypoint] applying Prisma schema (db push, no data loss)..."
prisma db push \
  --skip-generate \
  --schema /app/libraries/nestjs-libraries/src/database/prisma/schema.prisma

echo "[entrypoint] starting backend-only pm2-runtime (nginx, backend, orchestrator)..."
exec pm2-runtime start /app/ecosystem.config.cjs
