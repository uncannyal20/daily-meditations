#!/bin/sh
set -e

PB=/pb/pocketbase
ARGS="--dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --publicDir=/pb/pb_public"

# Create/update the admin (superuser) account for the /_/ dashboard from env.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  $PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $ARGS >/dev/null
fi

exec $PB serve --http=0.0.0.0:80 $ARGS
