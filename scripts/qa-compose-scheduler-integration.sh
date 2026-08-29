#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project="keyatlas-scheduler-qa-$$"
sentinel='compose-integration-sentinel'

cleanup() {
  NOTIFICATION_JOB_SECRET="$sentinel" docker compose \
    -p "$project" \
    -f "$repo_dir/docker-compose.prod.yml" \
    -f "$repo_dir/tests/compose/scheduler.compose.yml" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

NOTIFICATION_JOB_SECRET="$sentinel" docker compose \
  -p "$project" \
  -f "$repo_dir/docker-compose.prod.yml" \
  -f "$repo_dir/tests/compose/scheduler.compose.yml" \
  up --abort-on-container-exit --exit-code-from scheduler-verifier scheduler-verifier

echo "scheduler container integration verified without exposing the secret"
