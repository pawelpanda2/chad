#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT_DIR="$(cd "${SCRIPTS_PROJECT_DIR}/../.." && pwd)"
PROJECT_ROOT_DIR="${WORKSPACE_ROOT_DIR}"

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

# Ensure .env file exists
ensure_env_file() {
    local env_file="${PROJECT_ROOT_DIR}/.env"
    local env_example="${PROJECT_ROOT_DIR}/.env.example"

    if [[ -f "${env_file}" ]]; then
        echo_info "Plik .env już istnieje"
        return
    fi

    if [[ -f "${env_example}" ]]; then
        cp "${env_example}" "${env_file}"
        echo_info "Utworzono .env na podstawie .env.example"
        return
    fi

    echo_error "Brak pliku .env oraz .env.example"
    exit 1
}

# Check if Node.js is available
check_node() {
    if ! command -v node >/dev/null 2>&1; then
        echo_error "Brak polecenia node."
        exit 1
    fi

    if ! command -v npm >/dev/null 2>&1 && ! command -v pnpm >/dev/null 2>&1 && ! command -v yarn >/dev/null 2>&1; then
        echo_error "Brak menedżera pakietów (npm/pnpm/yarn)."
        exit 1
    fi
}

# Run application in production mode locally
run_local_prod() {
    echo_info "Uruchamianie aplikacji w trybie produkcyjnym (lokalnie)..."

    cd "${PROJECT_ROOT_DIR}"

    # Load environment variables from .env if exists
    if [[ -f "${PROJECT_ROOT_DIR}/.env" ]]; then
        echo_info "Ładowanie zmiennych środowiskowych z .env"
        set -a
        source "${PROJECT_ROOT_DIR}/.env"
        set +a
    fi

    # Build first
    echo_info "Buildowanie aplikacji..."
    if command -v npm >/dev/null 2>&1; then
        npm run build
        npm run start
    elif command -v pnpm >/dev/null 2>&1; then
        pnpm run build
        pnpm run start
    elif command -v yarn >/dev/null 2>&1; then
        yarn build
        yarn start
    else
        echo_error "Brak menedżera pakietów (npm/pnpm/yarn)"
        exit 1
    fi
}

# Show usage
usage() {
    echo "Użycie: $0 [opcje]"
    echo ""
    echo "Opcje:"
    echo "  --help      Pokaż tę pomoc"
    echo ""
    echo "Ten skrypt uruchamia aplikację lokalnie w trybie produkcyjnym."
    echo "Do Dockera użyj: 03_scripts/nodejs/04_docker_mac/build_docker_image.sh"
    echo ""
}

# Main execution
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
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
    echo_info "Personal Dashboard - Production (Local)"
    echo_info "========================================"
    echo_info ""

    # Ensure env file exists
    ensure_env_file

    # Check Node.js
    check_node

    # Run production server
    run_local_prod
}

main "$@"