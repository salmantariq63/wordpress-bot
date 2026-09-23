#!/bin/sh
set -e

# Railway sets RAILWAY_VOLUME_MOUNT_PATH when a volume is attached (e.g. /data).
DATA_ROOT="${RAILWAY_VOLUME_MOUNT_PATH:-/data}"

mkdir -p "$DATA_ROOT/prisma" "$DATA_ROOT/uploads/themes"

export UPLOAD_THEMES_DIR="${UPLOAD_THEMES_DIR:-$DATA_ROOT/uploads/themes}"

# Ignore broken local-style URLs if someone copied .env into Railway Variables.
case "${DATABASE_URL:-}" in
  "" | "file:./dev.db" | file:./dev.db*)
    export DATABASE_URL="file:${DATA_ROOT}/prisma/prod.db"
    ;;
esac

echo "Data root: ${DATA_ROOT}"
echo "DATABASE_URL: ${DATABASE_URL}"
echo "UPLOAD_THEMES_DIR: ${UPLOAD_THEMES_DIR}"

npx prisma db push
exec npm start
