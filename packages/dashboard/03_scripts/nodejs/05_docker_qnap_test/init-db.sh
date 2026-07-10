#!/usr/bin/env bash

# Initialize Database Script for QNAP Test Environment
# This script runs Prisma migrations and seeds the database

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"

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
    echo "  --migrate       Tylko migracja bazy danych"
    echo "  --seed          Tylko seed bazy danych (wymaga wcześniejszej migracji)"
    echo "  --all           Migracja i seed (domyślnie)"
    echo "  --help          Pokaż tę pomoc"
    echo ""
}

# Main function
main() {
    local mode="all"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --migrate)
                mode="migrate"
                shift
                ;;
            --seed)
                mode="seed"
                shift
                ;;
            --all)
                mode="all"
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
    echo_info "Personal Dashboard - Initialize Database (QNAP Test)"
    echo_info "========================================"
    echo_info ""
    echo_info "Mode: ${mode}"
    echo_info ""

    cd "${PROJECT_ROOT_DIR}"

    # Check if .env exists
    if [[ ! -f ".env" ]]; then
        echo_warn "File .env not found. Creating from .env.example..."
        cp .env.example .env
    fi

    # Source .env to get DATABASE_URL
    if [[ -f ".env" ]]; then
        export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)
    fi

    # Check if DATABASE_URL is set
    if [[ -z "${DATABASE_URL:-}" ]]; then
        echo_error "DATABASE_URL is not set!"
        echo_info "Please set DATABASE_URL in .env file or as environment variable."
        echo_info "Example: DATABASE_URL=file:./data/dev.db"
        exit 1
    fi

    echo_blue "Using DATABASE_URL: ${DATABASE_URL}"
    echo_info ""

    if [[ "${mode}" == "migrate" || "${mode}" == "all" ]]; then
        echo_info "Running Prisma migrations..."
        
        # Generate Prisma Client
        npx prisma generate
        
        # Run migrations
        npx prisma migrate deploy
        
        echo_info "Migrations completed successfully!"
    fi

    if [[ "${mode}" == "seed" || "${mode}" == "all" ]]; then
        echo_info "Seeding database..."
        
        # Run seed script
        npm run seed
        
        echo_info "Database seeded successfully!"
        echo_info ""
        echo_info "Default users:"
        echo_info "  Username: Pawel_F  Password: changeme"
        echo_info "  Username: Kamil_S  Password: changeme"
    fi

    echo_info ""
    echo_info "Database initialization completed!"
    echo_info "You can now start the application."
}

main "$@"