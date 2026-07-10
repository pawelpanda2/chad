#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.mac.yml"
COMPOSE_PROJECT_NAME="personal-dashboard-mac"
IMAGE_REPO="personal-dashboard"
IMAGE_TAG="latest"
FULL_IMAGE_NAME="${IMAGE_REPO}:${IMAGE_TAG}"

# Source common functions
source "${SCRIPTS_NODEJS_DIR}/03_docker_common/qnap_docker_common.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

echo_blue() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Show usage
usage() {
    echo "Użycie: $0 [opcje]"
    echo ""
    echo "Opcje:"
    echo "  -d, --detach    Uruchom w tle (tryb domyślny)"
    echo "  -f, --foreground Uruchom na pierwszym planie"
    echo "  --help          Pokaż tę pomoc"
    echo ""
}

# Check if container is running and stop it
check_and_stop_running_container() {
    echo_info "Sprawdzanie czy kontener jest już uruchomiony..."
    
    if "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" ps --format json 2>/dev/null | grep -q '"Running":true'; then
        echo_warn "Kontener jest już uruchomiony. Zatrzymywanie..."
        "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" down --remove-orphans
        echo_info "Kontener zatrzymany."
    else
        echo_info "Kontener nie jest uruchomiony."
    fi
}

# Display image information
display_image_info() {
    echo_blue "========================================"
    echo_blue "Image Information"
    echo_blue "========================================"
    echo_blue "Repository: ${IMAGE_REPO}"
    echo_blue "Tag: ${IMAGE_TAG}"
    echo_blue "Full name: ${FULL_IMAGE_NAME}"
    
    if docker image inspect "${FULL_IMAGE_NAME}" >/dev/null 2>&1; then
        local image_id
        image_id=$(docker image inspect --format='{{.Id}}' "${FULL_IMAGE_NAME}" 2>/dev/null | cut -d: -f2 | cut -c1-12)
        local created
        created=$(docker image inspect --format='{{.Created}}' "${FULL_IMAGE_NAME}" 2>/dev/null | cut -d. -f1 | tr 'T' ' ')
        echo_blue "Image ID: ${image_id}"
        echo_blue "Created: ${created}"
    else
        echo_warn "Obraz ${FULL_IMAGE_NAME} nie istnieje. Zostanie zbudowany przez docker compose."
    fi
    echo_blue "========================================"
    echo ""
}

# Main function
main() {
    local run_mode="detach"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--detach)
                run_mode="detach"
                shift
                ;;
            -f|--foreground)
                run_mode="foreground"
                shift
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
    echo_info "Personal Dashboard - Start Docker Container (Mac)"
    echo_info "========================================"
    echo_info ""
    echo_info "Tryb: ${run_mode}"
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

    # Display image information
    display_image_info

    cd "${PROJECT_ROOT_DIR}"

    # Check and stop running container if exists
    check_and_stop_running_container

    echo_info "Uruchamianie kontenera..."
    echo_info "Aplikacja będzie dostępna pod adresem: http://localhost:12020"
    echo_info "Content Provider API będzie dostępne pod adresem: http://localhost:12024"
    echo_info ""

    if [[ "${run_mode}" == "detach" ]]; then
        "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" up -d
        echo_info "Kontener uruchomiony w tle."
        echo_info "Aby zobaczyć logi: docker logs personal-dashboard-mac"
        echo_info "Aby zatrzymać: ${DOCKER_COMPOSE_CMD[*]} -f ${COMPOSE_FILE_PATH} down"
    else
        "${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" up
    fi
}

main "$@"