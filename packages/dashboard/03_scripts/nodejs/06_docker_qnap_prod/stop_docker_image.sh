#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.qnap.prod.yml"
COMPOSE_PROJECT_NAME="personal-dashboard-qnap-prod"

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

# Show usage
usage() {
    echo "Użycie: $0 [opcje]"
    echo ""
    echo "Opcje:"
    echo "  --all           Zatrzymaj i usuń wszystkie kontenery (w tym wolumeny)"
    echo "  --stop          Tylko zatrzymaj kontener (domyślnie)"
    echo "  --help          Pokaż tę pomoc"
    echo ""
}

# Main function
main() {
    local stop_mode="stop"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                stop_mode="all"
                shift
                ;;
            --stop)
                stop_mode="stop"
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
    echo_info "Personal Dashboard - Stop Docker Container (QNAP Prod)"
    echo_info "========================================"
    echo_info ""
    echo_info "Tryb: ${stop_mode}"
    echo_info ""

    # Ensure Docker and compose are available
    ensure_docker_compose_cmd

    # Set up runtime directories
    ensure_docker_runtime_dirs

    cd "${PROJECT_ROOT_DIR}"

    if [[ "${stop_mode}" == "all" ]]; then
        echo_info "Zatrzymywanie i usuwanie kontenerów oraz wolumenów..."
        "${DOCKER_COMPOSE_CMD[@]}" -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE_PATH}" down -v --remove-orphans
    else
        echo_info "Zatrzymywanie kontenera..."
        "${DOCKER_COMPOSE_CMD[@]}" -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE_PATH}" down
    fi

    echo_info ""
    echo_info "Kontener zatrzymany pomyślnie!"
}

main "$@"