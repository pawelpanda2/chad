#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
COMPOSE_FILE_PATH="${PROJECT_ROOT_DIR}/docker-compose.qnap.test.yml"
COMPOSE_PROJECT_NAME="personal-dashboard-qnap-test"
IMAGE_REPO="personal-dashboard"
IMAGE_TAG="${IMAGE_TAG:-}"
FULL_IMAGE_NAME="${IMAGE_REPO}:${IMAGE_TAG}"

DEFAULT_QNAP_PUBLIC_HOST="${QNAP_PUBLIC_HOST:-193.43.242.55}"
DEFAULT_FRONTEND_PORT="${TEST_FRONTEND_PORT:-12020}"
DEFAULT_BACKEND_PORT="${TEST_BACKEND_PORT:-12023}"
DEFAULT_CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"
QNAP_CP_ROOT_PATH="${QNAP_CP_ROOT_PATH:-/share/cp_1}"

COMMON_FILE="${SCRIPTS_NODEJS_DIR}/03_docker_common/qnap_docker_common.sh"
source "${COMMON_FILE}"

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
	echo "  --tag <TAG>     Uruchom konkretny tag obrazu"
	echo "  --list-tags     Pokaż dostępne tagi i zakończ"
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

resolve_latest_tag() {
	docker image ls "${IMAGE_REPO}" --format '{{.Tag}}' | grep -E '^[0-9]{2}-[0-9]{2}-[0-9]{2}__[0-9]{2}-[0-9]{2}-[0-9]{2}$' | sort | tail -n1
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

# Check if port is in use
check_port_in_use() {
	local port="$1"
	echo_info "Sprawdzanie czy port ${port} jest wolny..."
	
	# Check if port is in use
	if command -v lsof >/dev/null 2>&1; then
		if lsof -i :${port} >/dev/null 2>&1; then
			echo_error "Port ${port} is already in use!"
			echo_info "Containers using ports:"
			docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" 2>/dev/null || true
			echo_info ""
			echo_info "To stop the container using this port:"
			echo_info "  docker stop \$(docker ps -q --filter publish=${port})"
			return 1
		fi
	elif command -v netstat >/dev/null 2>&1; then
		if netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
			echo_error "Port ${port} is already in use!"
			echo_info "Containers using ports:"
			docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" 2>/dev/null || true
			return 1
		fi
	fi
	
	echo_info "Port ${port} is available."
	return 0
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
		echo_error "Obraz ${FULL_IMAGE_NAME} nie istnieje!"
		echo_info "Uruchom najpierw: bash build_docker_image.sh"
		list_tags
		exit 1
	fi
	echo_blue "========================================"
	echo ""
}

# Main function
main() {
	local run_mode="detach"
	local selected_tag=""
	local list_only="false"

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
			--tag)
				if [[ $# -lt 2 ]]; then
					echo_error "Brak wartości po --tag"
					usage
					exit 1
				fi
				selected_tag="$2"
				shift 2
				;;
			--list-tags)
				list_only="true"
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
	echo_info "Personal Dashboard - Start Docker Container (QNAP Test)"
	echo_info "========================================"
	echo_info ""
	echo_info "Tryb: ${run_mode}"
	echo_info ""

	# Ensure env file exists
	ensure_env_file "${PROJECT_ROOT_DIR}/.env" "${PROJECT_ROOT_DIR}/.env.example" "root .env"

	# Ensure Docker and compose are available
	ensure_docker_compose_cmd

	# Set up runtime directories
	ensure_docker_runtime_dirs

	if [[ "${list_only}" == "true" ]]; then
		list_tags
		exit 0
	fi

	# Export test ports for compose interpolation
	export TEST_FRONTEND_PORT="${DEFAULT_FRONTEND_PORT}"
	export TEST_BACKEND_PORT="${DEFAULT_BACKEND_PORT}"
	export CONTENT_PROVIDER_API_PORT="${DEFAULT_CONTENT_PROVIDER_API_PORT}"

	# Resolve tag
	if [[ -n "${selected_tag}" ]]; then
		IMAGE_TAG="${selected_tag}"
	else
		IMAGE_TAG="$(resolve_latest_tag || true)"
		if [[ -z "${IMAGE_TAG}" ]]; then
			echo_error "Nie znaleziono zbudowanego obrazu ${IMAGE_REPO} z tagiem czasowym."
			echo_info "Uruchom najpierw: bash build_docker_image.sh"
			exit 1
		fi
	fi

	FULL_IMAGE_NAME="${IMAGE_REPO}:${IMAGE_TAG}"
	export IMAGE_TAG

	# Display image information
	display_image_info

	echo_info "Host: ${DEFAULT_QNAP_PUBLIC_HOST}"
	echo_info "Frontend port: ${TEST_FRONTEND_PORT}"
	echo_info "Backend port: ${TEST_BACKEND_PORT}"
	echo_info "Content Provider API port: ${DEFAULT_CONTENT_PROVIDER_API_PORT}"
	echo_info "QNAP cp-root path: ${QNAP_CP_ROOT_PATH}"

	# Validate QNAP cp-root path exists
	echo_info "Sprawdzanie czy ścieżka QNAP cp-root istnieje..."
	if [[ ! -d "${QNAP_CP_ROOT_PATH}" ]]; then
		echo_error "Ścieżka QNAP cp-root nie istnieje: ${QNAP_CP_ROOT_PATH}"
		echo_error "Upewnij się, że katalog ${QNAP_CP_ROOT_PATH} istnieje i zawiera cp-root/content-provider."
		exit 1
	fi
	echo_info "Ścieżka QNAP cp-root istnieje: ${QNAP_CP_ROOT_PATH}"

	cd "${PROJECT_ROOT_DIR}"

	# Stop existing containers using stop script
	echo_info "Zatrzymywanie istniejących kontenerów..."
	bash "${SCRIPT_DIR}/stop_docker_image.sh"
	echo_info "Stare kontenery zatrzymane."

	# Check if port is in use
	if ! check_port_in_use "${TEST_FRONTEND_PORT}"; then
		echo_error "Cannot start container - port ${TEST_FRONTEND_PORT} is already in use."
		exit 1
	fi

	echo_info "Uruchamianie kontenera..."
	echo_info "Frontend: http://${DEFAULT_QNAP_PUBLIC_HOST}:${TEST_FRONTEND_PORT}"
	echo_info "Content Provider API: http://${DEFAULT_QNAP_PUBLIC_HOST}:${DEFAULT_CONTENT_PROVIDER_API_PORT}"
	echo_info ""

	if [[ "${run_mode}" == "detach" ]]; then
		"${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" up --no-build -d
		echo_info "Kontener uruchomiony w tle."
		echo_info "Aby zobaczyć logi: ${DOCKER_COMPOSE_CMD[*]} -f ${COMPOSE_FILE_PATH} logs -f"
		echo_info "Aby zatrzymać: ${DOCKER_COMPOSE_CMD[*]} -f ${COMPOSE_FILE_PATH} down"
	else
		"${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE_PATH}" up --no-build
	fi
}

main "$@"