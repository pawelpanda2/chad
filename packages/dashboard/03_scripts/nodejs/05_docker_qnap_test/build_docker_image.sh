#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.qnap.test.yml"

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

# Default values for QNAP test environment
DEFAULT_QNAP_PUBLIC_HOST="${QNAP_PUBLIC_HOST:-193.43.242.55}"
DEFAULT_FRONTEND_PORT="${TEST_FRONTEND_PORT:-12020}"
DEFAULT_BACKEND_PORT="${TEST_BACKEND_PORT:-12023}"

# Main build function
main() {
    echo_info "========================================"
    echo_info "Personal Dashboard - Build Docker Image (QNAP Test)"
    echo_info "========================================"
    echo_info ""

    # Ensure env file exists
    ensure_env_file "${PROJECT_ROOT_DIR}/.env" "${PROJECT_ROOT_DIR}/.env.example" "root .env"

    # Ensure Docker and compose are available
    ensure_docker_compose_cmd

    # Configure QNAP environment
    echo_info "Konfiguracja środowiska QNAP Test..."
    echo_info "Host: ${DEFAULT_QNAP_PUBLIC_HOST}"
    echo_info "Frontend port: ${DEFAULT_FRONTEND_PORT}"
    echo_info "Backend port: ${DEFAULT_BACKEND_PORT}"

    # Set up runtime directories
    ensure_docker_runtime_dirs

    # Generate image tag from last commit date (format: YY-MM-DD__HH-MM-SS)
    if [[ -z "${IMAGE_TAG:-}" ]]; then
        IMAGE_TAG="$(git log -1 --format=%cd --date=format:'%y-%m-%d__%H-%M-%S' 2>/dev/null || date +'%y-%m-%d__%H-%M-%S')"
        export IMAGE_TAG
        echo_info "Wygenerowano IMAGE_TAG z ostatniego commita: ${IMAGE_TAG}"
    else
        echo_info "Używam IMAGE_TAG z zmiennej środowiskowej: ${IMAGE_TAG}"
    fi

    echo_info "Root projektu: ${PROJECT_ROOT_DIR}"
    echo_info "Build z: ${COMPOSE_FILE_PATH}"
    echo_info "Image tag: ${IMAGE_TAG}"
    echo_info ""

    cd "${PROJECT_ROOT_DIR}"
    "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" build --pull

    echo_info ""
    echo_info "Build obrazu Docker (QNAP Test) zakończony pomyślnie!"
}

main "$@"