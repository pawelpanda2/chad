#!/usr/bin/env bash

# Clean Docker Images Script
# Keeps the last N images and the one currently running in production

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"

# Default settings
KEEP_COUNT="${KEEP_COUNT:-4}"
IMAGE_REPO="personal-dashboard"
PROD_CONTAINER_NAME="personal-dashboard-prod"

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
    echo "  --keep <N>      Liczba ostatnich obrazów do zachowania (domyślnie: 4)"
    echo "  --dry-run       Pokaż co zostanie usunięte, ale nie usuwaj"
    echo "  --help          Pokaż tę pomoc"
    echo ""
    echo "Skrypt usuwa stare obrazy Docker, zachowując:"
    echo "  - Ostatnie \$KEEP_COUNT obrazów z tagiem czasowym"
    echo "  - Obraz aktualnie uruchomiony w kontenerze produkcyjnym"
    echo ""
}

# Get the image tag currently used by production container
get_prod_image_tag() {
    local prod_tag=""
    if docker ps --format '{{.Names}}' | grep -q "^${PROD_CONTAINER_NAME}$"; then
        prod_tag=$(docker inspect --format='{{.Config.Image}}' "${PROD_CONTAINER_NAME}" 2>/dev/null | cut -d: -f2 || true)
    fi
    echo "${prod_tag}"
}

# Get all time-tagged images sorted by creation date (newest first)
get_time_tagged_images() {
    docker images "${IMAGE_REPO}" --format '{{.Tag}}|{{.CreatedAt}}|{{.ID}}' 2>/dev/null | \
        grep -E '^[0-9]{2}-[0-9]{2}-[0-9]{2}__[0-9]{2}-[0-9]{2}-[0-9]{2}\|' | \
        sort -t'|' -k2 -r || true
}

# Main function
main() {
    local dry_run="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --keep)
                if [[ $# -lt 2 ]]; then
                    echo_error "Brak wartości po --keep"
                    usage
                    exit 1
                fi
                KEEP_COUNT="$2"
                shift 2
                ;;
            --dry-run)
                dry_run="true"
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
    echo_info "Personal Dashboard - Clean Docker Images"
    echo_info "========================================"
    echo_info ""
    echo_info "Image repository: ${IMAGE_REPO}"
    echo_info "Keep last ${KEEP_COUNT} images"
    echo_info "Dry run: ${dry_run}"
    echo_info ""

    # Get production container's image tag
    local prod_tag
    prod_tag=$(get_prod_image_tag)
    if [[ -n "${prod_tag}" ]]; then
        echo_blue "Production container is using tag: ${prod_tag}"
    else
        echo_warn "No production container (${PROD_CONTAINER_NAME}) is running."
    fi
    echo_info ""

    # Get all time-tagged images
    echo_info "Scanning for time-tagged images..."
    local images
    images=$(get_time_tagged_images)

    if [[ -z "${images}" ]]; then
        echo_warn "No time-tagged images found. Nothing to clean."
        exit 0
    fi

    # Count images
    local total_count
    total_count=$(echo "${images}" | wc -l | tr -d ' ')
    echo_blue "Found ${total_count} time-tagged images."
    echo_info ""

    # Determine which images to keep
    local to_keep=()
    local to_remove=()
    local count=0

    while IFS='|' read -r tag created id; do
        count=$((count + 1))
        local keep="false"

        # Keep if it's in the last KEEP_COUNT
        if [[ ${count} -le ${KEEP_COUNT} ]]; then
            keep="true"
        fi

        # Keep if it's the production image
        if [[ -n "${prod_tag}" && "${tag}" == "${prod_tag}" ]]; then
            keep="true"
        fi

        if [[ "${keep}" == "true" ]]; then
            to_keep+=("${tag}")
        else
            to_remove+=("${tag}")
        fi
    done <<< "${images}"

    # Display results
    echo_blue "Images to KEEP (${#to_keep[@]}):"
    for tag in "${to_keep[@]}"; do
        echo "  ✓ ${tag}"
    done
    echo_info ""

    if [[ ${#to_remove[@]} -gt 0 ]]; then
        echo_blue "Images to REMOVE (${#to_remove[@]}):"
        for tag in "${to_remove[@]}"; do
            echo "  ✗ ${tag}"
        done
        echo_info ""
    else
        echo_warn "No images to remove."
        exit 0
    fi

    # Confirm before removing
    if [[ "${dry_run}" == "true" ]]; then
        echo_warn "DRY RUN - No images were removed."
        exit 0
    fi

    echo_warn "About to remove ${#to_remove[@]} images."
    echo_info "This action cannot be undone."
    echo_info ""

    # Remove images
    local removed=0
    local failed=0
    for tag in "${to_remove[@]}"; do
        local image_name="${IMAGE_REPO}:${tag}"
        echo_info "Removing ${image_name}..."
        if docker rmi "${image_name}" 2>/dev/null; then
            removed=$((removed + 1))
        else
            echo_warn "Failed to remove ${image_name} (may be in use by a container)"
            failed=$((failed + 1))
        fi
    done

    echo_info ""
    echo_info "Cleanup complete!"
    echo_info "  Removed: ${removed} images"
    if [[ ${failed} -gt 0 ]]; then
        echo_warn "  Failed: ${failed} images"
    fi
}

main "$@"