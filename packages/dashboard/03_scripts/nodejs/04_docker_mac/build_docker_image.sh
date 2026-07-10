#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.mac.yml"

# Source common functions
source "${SCRIPTS_NODEJS_DIR}/03_docker_common/qnap_docker_common.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main build function
main() {
    echo_info "========================================"
    echo_info "Personal Dashboard - Build Docker Image (Mac)"
    echo_info "========================================"
    echo_info ""

    # Ensure env file exists - prefer .env.04_docker_mac for Docker Mac
    if [[ -f "${PROJECT_ROOT_DIR}/.env.04_docker_mac" ]]; then
        cp "${PROJECT_ROOT_DIR}/.env.04_docker_mac" "${PROJECT_ROOT_DIR}/.env"
        echo_info "Skopiowano .env.04_docker_mac do .env"
    else
        ensure_env_file "${PROJECT_ROOT_DIR}/.env" "${PROJECT_ROOT_DIR}/.env.example" "root .env"
    fi

    # Ensure Docker and compose are available
    ensure_docker_compose_cmd

    echo_info "Root projektu: ${PROJECT_ROOT_DIR}"
    echo_info "Build z: ${COMPOSE_FILE_PATH}"
    echo_info ""

    cd "${PROJECT_ROOT_DIR}"
    "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" build --pull

    echo_info ""
    echo_info "Build obrazu Docker zakończony pomyślnie!"
}

main "$@"