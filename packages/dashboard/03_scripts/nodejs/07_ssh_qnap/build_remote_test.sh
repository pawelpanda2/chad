#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

# ============================================
# Step 0: Prepare environment variables
# Must be done FIRST to ensure correct env is loaded
# ============================================
echo "[INFO] Preparing environment for qnap_test..."
bash "${SCRIPT_DIR}/../01_envs/copy-env.sh" "qnap_test"

# Source the main SSH helper
source "${SCRIPT_DIR}/server_by_ssh_v3.sh"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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
    echo "  --only          Tylko build (bez stop/start)"
    echo "  --full          Full deploy (build + stop + start) - domyślnie"
    echo "  --help          Pokaż tę pomoc"
    echo ""
    echo "Ten skrypt łączy się przez SSH z QNAP i uruchamia build obrazu Docker"
    echo "w środowisku testowym (05_docker_qnap_test)."
    echo ""
}

# Main function
main() {
    local build_only="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --only)
                build_only="true"
                shift
                ;;
            --full)
                build_only="false"
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

    local ssh_target="${USERNAME}@${HOST}"
    local docker_dir="${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}/${TEST_DOCKER_DIR}"

    echo_info "========================================"
    echo_info "Remote Build - QNAP Test Environment"
    echo_info "========================================"
    echo_info ""
    echo_info "SSH Target:    ${ssh_target}:${PORT}"
    echo_info "QNAP Repo Dir: ${QNAP_REPO_DIR}"
    echo_info "Docker Dir:    ${docker_dir}"
    echo_info "Build Only:    ${build_only}"
    echo_info ""

    # Step 1: Update repository
    run_step "${ssh_target}" "Aktualizacja repo" "cd '${QNAP_REPO_DIR}' && git pull --ff-only"

    # Step 2: Get environment variables
    run_step "${ssh_target}" "Pobranie .env z repo env" "cd '${QNAP_REPO_DIR}' && bash '${SCRIPTS_ROOT_PATH}/01_envs_from_repo/get-env.sh' '${ENV_PROJECT_NAME}' 'nodejs'"

    # Step 3: Build Docker images
    run_step "${ssh_target}" "Budowanie obrazów Docker" "cd '${docker_dir}' && bash './build_docker_image.sh'"

    if [[ "${build_only}" == "true" ]]; then
        echo
        echo_info "✅ Build zakończony (tryb --only)"
        echo_info "Aby uruchomić kontenery, wykonaj:"
        echo_info "  bash ${SCRIPTS_ROOT_PATH}/${TEST_DOCKER_DIR}/stop_docker_image.sh"
        echo_info "  bash ${SCRIPTS_ROOT_PATH}/${TEST_DOCKER_DIR}/start_docker_image.sh"
    else
        # Step 4: Stop old containers
        run_step "${ssh_target}" "Zatrzymywanie starych kontenerów" "cd '${docker_dir}' && bash './stop_docker_image.sh'"

        # Step 5: Start containers
        run_step "${ssh_target}" "Start kontenerów Docker" "cd '${docker_dir}' && bash './start_docker_image.sh'"

        echo
        echo_info "✅ Full deploy zakończony"
    fi
}

main "$@"