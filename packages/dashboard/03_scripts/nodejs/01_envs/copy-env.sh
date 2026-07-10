#!/usr/bin/env bash
set -euo pipefail

# ============================================
# copy-env.sh - Standard env preparation helper
# ============================================
#
# This script prepares the working .env file for a specific environment.
# The main .env is a working file that gets overwritten, so each
# environment-specific script should call this helper first.
#
# Supported env names:
#   local_mac   -> .env.02_local_mac
#   docker_mac  -> .env.04_docker_mac
#   qnap_test   -> .env.05_docker_qnap_test
#   qnap_prod   -> .env.06_docker_qnap_prod
#
# ============================================

ENV_NAME="${1:-}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
TARGET_ENV_FILE="${PROJECT_ROOT_DIR}/.env"

if [[ -z "${ENV_NAME}" ]]; then
  echo "❌ Missing env name."
  echo "Usage: bash copy-env.sh <local_mac|docker_mac|qnap_test|qnap_prod>"
  exit 1
fi

case "${ENV_NAME}" in
  local_mac)
    SOURCE_ENV_FILENAME=".env.02_local_mac"
    ;;
  docker_mac)
    SOURCE_ENV_FILENAME=".env.04_docker_mac"
    ;;
  qnap_test)
    SOURCE_ENV_FILENAME=".env.05_docker_qnap_test"
    ;;
  qnap_prod)
    SOURCE_ENV_FILENAME=".env.06_docker_qnap_prod"
    ;;
  *)
    echo "❌ Unknown env name: ${ENV_NAME}"
    echo "Allowed values:"
    echo "  local_mac"
    echo "  docker_mac"
    echo "  qnap_test"
    echo "  qnap_prod"
    exit 1
    ;;
esac

SOURCE_ENV_FILE="${PROJECT_ROOT_DIR}/${SOURCE_ENV_FILENAME}"

echo "[INFO] copy-env.sh diagnostic"
echo "[INFO] Script path: ${BASH_SOURCE[0]}"
echo "[INFO] Script dir: ${SCRIPT_DIR}"
echo "[INFO] Project root: ${PROJECT_ROOT_DIR}"
echo "[INFO] Current pwd: $(pwd)"
echo "[INFO] Environment: ${ENV_NAME}"
echo "[INFO] Source env filename: ${SOURCE_ENV_FILENAME}"
echo "[INFO] Source env: ${SOURCE_ENV_FILE}"
echo "[INFO] Target env: ${TARGET_ENV_FILE}"

if [[ ! -f "${SOURCE_ENV_FILE}" ]]; then
  echo "❌ Source env file not found:"
  echo "   ${SOURCE_ENV_FILE}"
  echo "[DEBUG] Files matching .env* in project root:"
  ls -la "${PROJECT_ROOT_DIR}"/.env* 2>/dev/null || true
  exit 1
fi

if [[ -f "${TARGET_ENV_FILE}" ]]; then
  BACKUP_FILE="${PROJECT_ROOT_DIR}/.env.backup_before_copy_env_$(date +'%y%m%d_%H%M%S')"
  cp "${TARGET_ENV_FILE}" "${BACKUP_FILE}"
  echo "[INFO] Backup created: ${BACKUP_FILE}"
fi

cp "${SOURCE_ENV_FILE}" "${TARGET_ENV_FILE}"

echo "[INFO] Copied:"
echo "[INFO]   ${SOURCE_ENV_FILE}"
echo "[INFO] -> ${TARGET_ENV_FILE}"
echo "[INFO] Done."