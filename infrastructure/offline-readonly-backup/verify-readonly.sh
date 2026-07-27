#!/usr/bin/env bash
# Exit 0 when SELECT works and every write is rejected.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

if [ -z "$OFFLINE_READONLY_BACKUP_READER_PASSWORD" ]; then
  echo "ERROR: OFFLINE_READONLY_BACKUP_READER_PASSWORD is required" >&2
  exit 1
fi

URI="$(reader_uri)"
TMP_TABLE="offline_readonly_backup_verify_$$"

failures=0

expect_ok() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS: $label"
  else
    echo "FAIL: $label (expected success)" >&2
    failures=$((failures + 1))
  fi
}

expect_denied() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: $label (write succeeded — must be blocked)" >&2
    failures=$((failures + 1))
  else
    echo "PASS: $label blocked"
  fi
}

expect_ok "SELECT" psql "$URI" -v ON_ERROR_STOP=1 -c "SELECT 1"
expect_denied "INSERT" psql "$URI" -v ON_ERROR_STOP=1 -c "INSERT INTO cp_items DEFAULT VALUES"
expect_denied "UPDATE" psql "$URI" -v ON_ERROR_STOP=1 -c "UPDATE cp_items SET body = body WHERE false"
expect_denied "DELETE" psql "$URI" -v ON_ERROR_STOP=1 -c "DELETE FROM cp_items WHERE false"
expect_denied "CREATE TABLE" psql "$URI" -v ON_ERROR_STOP=1 -c "CREATE TABLE ${TMP_TABLE} (id int)"

if [ "$failures" -ne 0 ]; then
  echo "verify-readonly: FAILED ($failures checks)" >&2
  exit 1
fi

echo "verify-readonly: PASS"
exit 0
