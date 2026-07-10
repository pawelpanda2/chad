#!/usr/bin/env bash

set -euo pipefail

qnap_init_context() {
  local script_path="$1"

  SCRIPT_DIR="$(cd "$(dirname "${script_path}")" && pwd)"
  SCRIPTS_PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  WORKSPACE_ROOT_DIR="$(cd "${SCRIPTS_PROJECT_DIR}/../.." && pwd)"
  PROJECT_KEY="$(basename "${SCRIPTS_PROJECT_DIR}")"
  PROJECT_ROOT_DIR="${WORKSPACE_ROOT_DIR}/${PROJECT_KEY}"
  COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.qnap.yml"
}

ensure_env_file() {
  local env_file="$1"
  local env_example="$2"
  local label="$3"

  if [[ -f "${env_file}" ]]; then
    return
  fi

  if [[ -f "${env_example}" ]]; then
    cp "${env_example}" "${env_file}"
    echo "[INFO] Utworzono ${label}: ${env_file} (z ${env_example})"
    return
  fi

  echo "[ERROR] Brak ${label}: ${env_file} oraz brak pliku wzorcowego: ${env_example}"
  exit 1
}

get_env_value() {
  local env_file="$1"
  local key="$2"
  local default_value="$3"

  if [[ -f "${env_file}" ]]; then
    local matched_line
    matched_line="$(grep -E "^${key}=" "${env_file}" | tail -n1 || true)"
    if [[ -n "${matched_line}" ]]; then
      echo "${matched_line#*=}"
      return
    fi
  fi

  echo "${default_value}"
}

upsert_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  if grep -qE "^${key}=" "${env_file}"; then
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" "${env_file}"
    rm -f "${env_file}.bak"
  else
    printf "\n%s=%s\n" "${key}" "${value}" >>"${env_file}"
  fi
}

resolve_public_url() {
  local backend_port="$1"
  local default_host="$2"
  local host="${default_host}"

  if [[ "${host}" =~ ^https?:// ]]; then
    if [[ "${host}" =~ :[0-9]+$ ]]; then
      echo "${host}"
    else
      echo "${host}:${backend_port}"
    fi
  else
    echo "http://${host}:${backend_port}"
  fi
}

ensure_docker_runtime_dirs() {
  local preferred_home="/share/homes/${USER}"
  local fallback_home="/tmp/${USER}-home"
  local selected_home="${HOME:-}"

  if [[ -z "${selected_home}" || ! -d "${selected_home}" || ! -w "${selected_home}" ]]; then
    if [[ -d "${preferred_home}" && -w "${preferred_home}" ]]; then
      selected_home="${preferred_home}"
    else
      selected_home="${fallback_home}"
      mkdir -p "${selected_home}"
    fi
  fi

  export HOME="${selected_home}"

  local selected_docker_config="${DOCKER_CONFIG:-${HOME}/.docker}"
  if [[ ! -d "${selected_docker_config}" ]]; then
    mkdir -p "${selected_docker_config}" 2>/dev/null || true
  fi

  if [[ ! -d "${selected_docker_config}" || ! -w "${selected_docker_config}" ]]; then
    selected_docker_config="/tmp/${USER}-docker-config"
    mkdir -p "${selected_docker_config}"
  fi

  export DOCKER_CONFIG="${selected_docker_config}"
}

ensure_docker_compose_cmd() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Brak polecenia docker."
    echo "[ERROR] Na Macu zainstaluj Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
  fi

  # Check if Docker daemon is running
  if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon nie jest uruchomiony."
    echo "[ERROR] Na Macu uruchom Docker Desktop lub wykonaj:"
    echo "[ERROR]   open -a Docker"
    echo "[ERROR]"
    echo "[ERROR] Poczekaj aż Docker Desktop się uruchomi (ikona wieloryba w pasku menu)."
    exit 1
  fi

  DOCKER_COMPOSE_CMD=()
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker-compose)
  else
    echo "[ERROR] Brak docker compose (plugin lub docker-compose)."
    exit 1
  fi

  if [[ ! -f "${COMPOSE_FILE_PATH}" ]]; then
    echo "[ERROR] Nie znaleziono pliku compose: ${COMPOSE_FILE_PATH}"
    exit 1
  fi
}

prepare_qnap_env() {
  local default_host="$1"
  local frontend_port="$2"
  local backend_port="$3"

  local root_env_file="${PROJECT_ROOT_DIR}/.env"
  local frontend_env_file="${PROJECT_ROOT_DIR}/frontend/.env"
  local public_url

  ensure_env_file "${PROJECT_ROOT_DIR}/.env" "${PROJECT_ROOT_DIR}/.env.example" "root .env"
  ensure_env_file "${PROJECT_ROOT_DIR}/backend/.env" "${PROJECT_ROOT_DIR}/backend/.env.example" "backend .env"
  ensure_env_file "${PROJECT_ROOT_DIR}/frontend/.env" "${PROJECT_ROOT_DIR}/frontend/.env.example" "frontend .env"

  public_url="$(resolve_public_url "${backend_port}" "${default_host}")"

  upsert_env_value "${root_env_file}" "FRONTEND_PORT" "${frontend_port}"
  upsert_env_value "${root_env_file}" "BACKEND_PORT" "${backend_port}"
  upsert_env_value "${root_env_file}" "NEXT_PUBLIC_LANGGRAPH_API_URL" "${public_url}"
  upsert_env_value "${root_env_file}" "LANGGRAPH_API_URL_INTERNAL" "http://backend:12003"
  upsert_env_value "${frontend_env_file}" "NEXT_PUBLIC_LANGGRAPH_API_URL" "${public_url}"

  echo "[INFO] Ustawiono URL: ${public_url}"
  echo "[INFO] Ustawiono porty: frontend=${frontend_port}, backend=${backend_port}"
}

qnap_build() {
  echo "[INFO] Root projektu: ${PROJECT_ROOT_DIR}"
  echo "[INFO] Build obrazow z: ${COMPOSE_FILE_PATH}"
  echo "[INFO] HOME=${HOME}"
  echo "[INFO] DOCKER_CONFIG=${DOCKER_CONFIG}"

  cd "${PROJECT_ROOT_DIR}"
  "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" build --pull

  echo "[INFO] Build obrazow zakonczony pomyslnie."
}

qnap_run() {
  echo "[INFO] Root projektu: ${PROJECT_ROOT_DIR}"
  echo "[INFO] Start kontenerow z: ${COMPOSE_FILE_PATH}"
  echo "[INFO] HOME=${HOME}"
  echo "[INFO] DOCKER_CONFIG=${DOCKER_CONFIG}"

  cd "${PROJECT_ROOT_DIR}"
  "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" up -d
  "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" ps

  echo "[INFO] Kontenery uruchomione."
}

qnap_stop() {
  echo "[INFO] Root projektu: ${PROJECT_ROOT_DIR}"
  echo "[INFO] Stop kontenerow z: ${COMPOSE_FILE_PATH}"
  echo "[INFO] HOME=${HOME}"
  echo "[INFO] DOCKER_CONFIG=${DOCKER_CONFIG}"

  cd "${PROJECT_ROOT_DIR}"
  "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" down --remove-orphans --rmi local

  echo "[INFO] Kontenery zatrzymane i obrazy lokalne usuniete."
}
