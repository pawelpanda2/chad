#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.qnap.prod.yml"
COMPOSE_PROJECT_NAME="personal-dashboard-qnap-prod"
IMAGE_REPO="personal-dashboard"

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

usage() {
    echo "Użycie: $0 [opcje]"
    echo ""
    echo "Opcje:"
    echo "  --tag <TAG>     Wymuś konkretny tag obrazu (np. 26-06-05__17-43-50)"
    echo "  --help          Pokaż tę pomoc"
    echo ""
}

list_tags() {
    local tags
    tags="$(docker image ls "${IMAGE_REPO}" --format '{{.Tag}}' | grep -E '^[0-9]{2}-[0-9]{2}-[0-9]{2}__[0-9]{2}-[0-9]{2}-[0-9]{2}$' | sort -r || true)"

    if [[ -z "${tags}" ]]; then
        echo_warn "Brak tagów czasowych dla obrazu ${IMAGE_REPO}."
        return
    fi

    echo_info "Dostępne tagi (${IMAGE_REPO}):"
    while IFS= read -r tag; do
        echo "  - ${tag}"
    done <<<"${tags}"
}

resolve_default_tag() {
    git -C "${PROJECT_ROOT_DIR}" log -1 --format=%cd --date=format:'%y-%m-%d__%H-%M-%S' 2>/dev/null || date +'%y-%m-%d__%H-%M-%S'
}

# Default values for QNAP production environment
DEFAULT_QNAP_PUBLIC_HOST="${QNAP_PUBLIC_HOST:-193.43.242.55}"
DEFAULT_FRONTEND_PORT="${PROD_FRONTEND_PORT:-12030}"
DEFAULT_BACKEND_PORT="${PROD_BACKEND_PORT:-12033}"

# Main build function
main() {
    local forced_tag=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --tag)
                if [[ $# -lt 2 ]]; then
                    echo_error "Brak wartości po --tag"
                    usage
                    exit 1
                fi
                forced_tag="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                echo_error "Nieznana opcja: $1"
                usage
                exit 1
                ;;
        esac
    done

    echo_info "========================================"
    echo_info "Personal Dashboard - Build Docker Image (QNAP Prod)"
    echo_info "========================================"
    echo_info ""

    # Ensure env file exists
    ensure_env_file "${PROJECT_ROOT_DIR}/.env" "${PROJECT_ROOT_DIR}/.env.example" "root .env"

    # Ensure Docker and compose are available
    ensure_docker_compose_cmd

    # Configure QNAP environment
    echo_info "Konfiguracja środowiska QNAP Prod..."
    echo_info "Host: ${DEFAULT_QNAP_PUBLIC_HOST}"
    echo_info "Frontend port: ${DEFAULT_FRONTEND_PORT}"
    echo_info "Backend port: ${DEFAULT_BACKEND_PORT}"

    # Set up runtime directories
    ensure_docker_runtime_dirs

    # Generate image tag from last commit date (format: YY-MM-DD__HH-MM-SS)
    if [[ -n "${forced_tag}" ]]; then
        IMAGE_TAG="${forced_tag}"
        export IMAGE_TAG
        echo_info "Używam IMAGE_TAG z parametru --tag: ${IMAGE_TAG}"
    elif [[ -z "${IMAGE_TAG:-}" ]]; then
        IMAGE_TAG="$(resolve_default_tag)"
        export IMAGE_TAG
        echo_info "Wygenerowano IMAGE_TAG z ostatniego commita: ${IMAGE_TAG}"
    else
        echo_info "Używam IMAGE_TAG z zmiennej środowiskowej: ${IMAGE_TAG}"
    fi

    echo_info "Root projektu: ${PROJECT_ROOT_DIR}"
    echo_info "Build z: ${COMPOSE_FILE_PATH}"
    echo_info "Compose project: ${COMPOSE_PROJECT_NAME}"
    echo_info "Image tag: ${IMAGE_TAG}"
    echo_info ""

    cd "${PROJECT_ROOT_DIR}"
    "${DOCKER_COMPOSE_CMD[@]}" -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE_PATH}" build --pull

    echo_info ""
    echo_info "Build obrazu Docker (QNAP Prod) zakończony pomyślnie!"
    list_tags
}

main "$@"