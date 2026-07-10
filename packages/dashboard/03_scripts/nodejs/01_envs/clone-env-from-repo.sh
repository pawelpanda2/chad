#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT_DIR="$(cd "${SCRIPTS_PROJECT_DIR}/../.." && pwd)"
PROJECT_KEY="$(basename "${SCRIPTS_PROJECT_DIR}")"
PROJECT_ROOT_DIR="${WORKSPACE_ROOT_DIR}/${PROJECT_KEY}"
TEMP_DIR="${WORKSPACE_ROOT_DIR}/temp"
ENVS_REPO_DIR="${TEMP_DIR}/env"
ENVS_REPO_URL="git@github.com:pawelpanda2/env.git"
TARGET_REPO_DIR="${PROJECT_ROOT_DIR}"

usage() {
  echo "Uzycie: $0 <project_name> [target_repo_dir]"
  echo "Przyklad: $0 chat-ai-game_26-06-01"
}

if [[ "${1:-}" == "" ]]; then
  usage
  exit 1
fi

PROJECT_NAME="$1"
if [[ "${2:-}" != "" ]]; then
  TARGET_REPO_DIR="$2"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] Brak polecenia git"
  exit 1
fi

mkdir -p "${TEMP_DIR}"

if [[ ! -d "${ENVS_REPO_DIR}/.git" ]]; then
  echo "[INFO] Klonuje repo env do: ${ENVS_REPO_DIR}"
  git clone "${ENVS_REPO_URL}" "${ENVS_REPO_DIR}"
else
  echo "[INFO] Aktualizuje repo env w: ${ENVS_REPO_DIR}"
  git -C "${ENVS_REPO_DIR}" fetch --all --prune
  git -C "${ENVS_REPO_DIR}" pull --ff-only
fi

PROJECT_DIR="${ENVS_REPO_DIR}/${PROJECT_NAME}"

if [[ ! -d "${PROJECT_DIR}" ]]; then
  echo "[ERROR] Nie znaleziono projektu w repo env: ${PROJECT_DIR}"
  exit 1
fi

LATEST_DIR="$(find "${PROJECT_DIR}" -mindepth 1 -maxdepth 1 -type d -regex '.*/[0-9][0-9]-[0-9][0-9]-[0-9][0-9]' | sort | tail -n 1)"

if [[ "${LATEST_DIR}" == "" ]]; then
  # Backward-compatible layout: /project/... without date folder
  LATEST_DIR="${PROJECT_DIR}"
  echo "[WARN] Brak folderu daty (yy-mm-dd) - uzywam katalogu projektu bezposrednio: ${LATEST_DIR}"
fi

echo "[INFO] Uzywam envow z: ${LATEST_DIR}"

env_count=0
while IFS= read -r env_file; do
  rel_path="${env_file#${LATEST_DIR}/}"
  target_file="${TARGET_REPO_DIR}/${rel_path}"
  mkdir -p "$(dirname "${target_file}")"
  cp "${env_file}" "${target_file}"
  echo "[INFO] Skopiowano: ${rel_path}"
  env_count=$((env_count + 1))
done < <(find "${LATEST_DIR}" -type f -name '.env*')

if [[ "${env_count}" -eq 0 ]]; then
  echo "[WARN] Nie znaleziono zadnych plikow .env* w: ${LATEST_DIR}"
  exit 1
fi

echo "[INFO] Gotowe. Skopiowano ${env_count} plik(ow) .env do: ${TARGET_REPO_DIR}"
