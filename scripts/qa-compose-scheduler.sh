#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sentinel='compose-scheduler-wiring-sentinel'

NOTIFICATION_JOB_SECRET="$sentinel" \
  docker compose -f "$repo_dir/docker-compose.prod.yml" config --format json \
  | node "$repo_dir/scripts/verify-compose-scheduler.mjs" "$sentinel"

if env -u NOTIFICATION_JOB_SECRET docker compose -f "$repo_dir/docker-compose.prod.yml" config --quiet 2>/dev/null; then
  echo "Compose unexpectedly accepted a missing NOTIFICATION_JOB_SECRET" >&2
  exit 1
fi

echo "missing NOTIFICATION_JOB_SECRET correctly rejected"
