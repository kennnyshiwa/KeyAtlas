#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"

if [[ -z "$API_KEY" ]]; then
  echo "ERROR: API_KEY is required"
  echo "Usage: API_KEY=kv_xxx scripts/qa-smoke.sh"
  exit 1
fi

pass=0
fail=0
warn=0

check_status() {
  local path="$1"
  local expected="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  if [[ "$code" == "$expected" ]]; then
    echo "PASS $path -> $code"
    pass=$((pass+1))
  else
    echo "FAIL $path -> got $code expected $expected"
    fail=$((fail+1))
  fi
}

check_auth_api_ok() {
  local path="$1"
  local key="$2"
  local code
  code=$(curl -s -o /tmp/qa_api_body.json -w "%{http_code}" -H "Authorization: Bearer $key" "$BASE_URL$path")
  if [[ "$code" == "200" ]]; then
    echo "PASS AUTH $path -> $code"
    pass=$((pass+1))
  else
    echo "FAIL AUTH $path -> got $code expected 200"
    fail=$((fail+1))
  fi
}

check_auth_required() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  if [[ "$code" == "401" ]]; then
    echo "PASS NOAUTH $path -> $code"
    pass=$((pass+1))
  else
    echo "FAIL NOAUTH $path -> got $code expected 401"
    fail=$((fail+1))
  fi
}

echo "== Route checks =="
for p in / /projects /forums /guides /activity /compare /vendors /calendar /statistics /sign-in; do
  check_status "$p" "200"
done

echo "== API v1 auth-required checks =="
for p in /api/v1/projects /api/v1/projects/latest /api/v1/vendors /api/v1/categories '/api/v1/calendar?month=2&year=2026'; do
  check_auth_required "$p"
  check_auth_api_ok "$p" "$API_KEY"
done

echo "== Protected endpoint checks =="
for p in /api/profile /api/notifications; do
  check_auth_required "$p"
done

echo "== 404 checks (status + soft check) =="
for p in /projects/nonexistent-slug-xyz /users/nonexistent-user-xyz /forums/nonexistent-category-xyz; do
  code=$(curl -s -o /tmp/qa_nf.html -w "%{http_code}" "$BASE_URL$p")
  if [[ "$code" == "404" ]]; then
    echo "PASS 404 $p -> 404"
    pass=$((pass+1))
  else
    if grep -Eiq "404|not found|doesn't exist" /tmp/qa_nf.html; then
      echo "FAIL soft-404 $p -> HTTP $code with not-found UI (expected real 404)"
      fail=$((fail+1))
    else
      echo "FAIL 404 $p -> got $code and no not-found markers"
      fail=$((fail+1))
    fi
  fi
done

echo "\n== QA Summary =="
echo "PASS: $pass"
echo "WARN: $warn"
echo "FAIL: $fail"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
