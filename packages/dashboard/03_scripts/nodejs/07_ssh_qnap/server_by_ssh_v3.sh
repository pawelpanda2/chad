#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

# ============================================
# Load environment variables from .env
# ============================================
read_env_value() {
  local env_file="$1"
  local key="$2"

  [[ -f "${env_file}" ]] || return 1

  awk -F'=' -v key="${key}" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      k = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (k != key) next

      v = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      gsub(/^'"'"'|'"'"'$/, "", v)
      print v
      exit
    }
  ' "${env_file}"
}

# Get config value with priority: env var > .env > .env.07_ssh_qnap > default
get_config_value() {
  local key="$1"
  local default_value="${2:-}"
  local value=""

  # First check if set as shell environment variable
  value="${!key:-}"
  if [[ -n "${value}" ]]; then
    echo "${value}"
    return 0
  fi

  # Then check .env in root
  value="$(read_env_value "${REPO_ROOT}/.env" "${key}" || true)"
  if [[ -n "${value}" ]]; then
    echo "${value}"
    return 0
  fi

  # Then check .env.07_ssh_qnap
  value="$(read_env_value "${REPO_ROOT}/.env.07_ssh_qnap" "${key}" || true)"
  if [[ -n "${value}" ]]; then
    echo "${value}"
    return 0
  fi

  # Return default
  echo "${default_value}"
}

# Load configuration
HOST="$(get_config_value QNAP_SSH_HOST "")"
PORT="$(get_config_value QNAP_SSH_PORT "22")"
USERNAME="$(get_config_value QNAP_SSH_USERNAME "")"
QNAP_REPO_DIR="$(get_config_value QNAP_REPO_DIR "")"
ENV_PROJECT_NAME="$(get_config_value ENV_PROJECT_NAME "personal-dashboard")"
QNAP_SSH_PASSWORD="$(get_config_value QNAP_SSH_PASSWORD "")"

# Validate required configuration
require_config() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "❌ Missing config: ${key}"
    echo "Add it to ${REPO_ROOT}/.env or export it in shell."
    echo ""
    echo "Required variables:"
    echo "  QNAP_SSH_HOST=100.117.139.83"
    echo "  QNAP_SSH_USERNAME=pawelfluder"
    echo "  QNAP_REPO_DIR=/share/qnap/03_files_programming/03_github/personal-dashboard"
    echo "  QNAP_SSH_PORT=22"
    echo ""
    echo "Optional:"
    echo "  QNAP_SSH_PASSWORD=... (to avoid interactive password prompt)"
    exit 1
  fi
}

require_config "QNAP_SSH_HOST" "${HOST}"
require_config "QNAP_SSH_USERNAME" "${USERNAME}"
require_config "QNAP_REPO_DIR" "${QNAP_REPO_DIR}"
require_config "QNAP_SSH_PORT" "${PORT}"

# Set variables for use in this script
# Current project paths (personal-dashboard)
SCRIPTS_ROOT_PATH="03_scripts/nodejs"
TEST_DOCKER_DIR="05_docker_qnap_test"
PROD_DOCKER_DIR="06_docker_qnap_prod"

get_qnap_password() {
  local value=""

  # First check if QNAP_SSH_PASSWORD is set as environment variable
  if [[ -n "${QNAP_SSH_PASSWORD:-}" ]]; then
    echo "${QNAP_SSH_PASSWORD}"
    return 0
  fi

  # Check .env files
  local env_candidates=(
    "${REPO_ROOT}/.env"
    "${REPO_ROOT}/.env.07_ssh_qnap"
  )
  local env_file

  for env_file in "${env_candidates[@]}"; do
    value="$(read_env_value "${env_file}" "QNAP_SSH_PASSWORD" || true)"
    if [[ -n "${value}" ]]; then
      echo "${value}"
      return 0
    fi

    # Backward compatibility for snake_case style
    value="$(read_env_value "${env_file}" "qnap_password" || true)"
    if [[ -n "${value}" ]]; then
      echo "${value}"
      return 0
    fi

    # Backward compatibility for dash style
    value="$(read_env_value "${env_file}" "qnap-password" || true)"
    if [[ -n "${value}" ]]; then
      echo "${value}"
      return 0
    fi
  done

  return 1
}

run_step() {
  local ssh_target="$1"
  local step_label="$2"
  local remote_cmd="$3"
  local remote_script
  local escaped_remote_script
  local qnap_password

  echo
  echo "▶ ${step_label}"
  echo "$ ${remote_cmd}"

  remote_script="export PATH=\"/opt/bin:/opt/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/sbin:/usr/sbin:\${PATH}\"; ${remote_cmd}"
  printf -v escaped_remote_script '%q' "${remote_script}"

  qnap_password="$(get_qnap_password || true)"

  # -tt wymusza pseudo-TTY, dzięki temu output jest widoczny na żywo.
  if [[ -n "${qnap_password}" ]] && command -v sshpass >/dev/null 2>&1; then
    SSHPASS="${qnap_password}" sshpass -e ssh -tt -p "${PORT}" "${ssh_target}" "bash -lc ${escaped_remote_script}"
  elif [[ -n "${qnap_password}" ]] && command -v expect >/dev/null 2>&1; then
    EXPECT_QNAP_PASSWORD="${qnap_password}" expect <<EOF
set timeout -1
log_user 1

set port "${PORT}"
set target "${ssh_target}"
set remote "bash -lc ${escaped_remote_script}"
set password $env(EXPECT_QNAP_PASSWORD)

spawn ssh -tt -p $port $target $remote

expect {
  -re {(?i)yes/no} {
    send -- "yes\r"
    exp_continue
  }
  -re {(?i)password:} {
    send -- "$password\r"
    exp_continue
  }
  eof
}

catch wait result
set code [lindex $result 3]
exit $code
EOF
  else
    ssh -tt -p "${PORT}" "${ssh_target}" "bash -lc ${escaped_remote_script}"
  fi

  echo "✅ Krok zakończony"
}

# Prepare env on QNAP using copy-env.sh (direct execution with diagnostics)
copy_remote_env() {
  local ssh_target="$1"
  local environment="$2"
  local copy_env_name=""

  # Map deploy environment to copy-env.sh argument
  if [[ "${environment}" == "test" ]]; then
    copy_env_name="qnap_test"
  elif [[ "${environment}" == "prod" ]]; then
    copy_env_name="qnap_prod"
  else
    echo "❌ Unknown environment for copy-env: ${environment}"
    exit 1
  fi

  # Directly run copy-env.sh with full diagnostics
  run_step "${ssh_target}" "Przygotowanie .env przez copy-env.sh ${copy_env_name}" "cd '${QNAP_REPO_DIR}' && echo '--- RUN COPY ENV ---' && echo \"PWD before cd: \$(pwd)\" && pwd && echo \"Git root: \$(git rev-parse --show-toplevel 2>/dev/null || echo '<no git root>')\" && echo \"Listing copy-env dir:\" && ls -la 03_scripts/nodejs/01_envs && echo \"Changing to copy-env dir...\" && cd 03_scripts/nodejs/01_envs && echo \"PWD after cd to copy-env dir: \$(pwd)\" && echo \"Running: bash ./copy-env.sh ${copy_env_name}\" && bash ./copy-env.sh ${copy_env_name}"
}

deploy_env() {
  local environment="${1:-}"
  local docker_dir
  local frontend_port
  local api_port
  local will_build="NO"
  local env_file_to_copy=""

  if [[ "${environment}" != "test" && "${environment}" != "prod" ]]; then
    echo "❌ Nieznane środowisko. Użyj: test albo prod."
    return 1
  fi

  local ssh_target="${USERNAME}@${HOST}"

  # Determine docker directory and ports based on environment
  if [[ "${environment}" == "prod" ]]; then
    docker_dir="${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}/${PROD_DOCKER_DIR}"
    frontend_port="12030"
    api_port="12034"
    env_file_to_copy=".env.06_docker_qnap_prod"
  else
    docker_dir="${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}/${TEST_DOCKER_DIR}"
    frontend_port="12020"
    api_port="12024"
    env_file_to_copy=".env.05_docker_qnap_test"
  fi

  # Test builds images, prod uses already built images
  if [[ "${environment}" == "test" ]]; then
    will_build="YES"
  fi

  # Show deployment summary
  echo
  echo "========================================"
  echo "📋 Deployment Summary"
  echo "========================================"
  echo "Environment:      ${environment}"
  echo "SSH Target:       ${ssh_target}:${PORT}"
  echo "QNAP Repo Dir:    ${QNAP_REPO_DIR}"
  echo "Project Name:     ${ENV_PROJECT_NAME}"
  echo "Scripts Root:     ${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}"
  echo "Docker Dir:       ${docker_dir}"
  echo "Frontend Port:    ${frontend_port}"
  echo "API Port:         ${api_port}"
  echo "Env file copied:  ${env_file_to_copy} -> .env"
  echo "Build Image:      ${will_build}"
  echo "Stop/Start:       YES"
  if [[ "${environment}" == "prod" ]]; then
    echo "Image Tag:        latest (from test build)"
  fi
  echo "========================================"
  echo

  # Safety confirmation for prod
  if [[ "${environment}" == "prod" ]]; then
    echo "⚠️  WARNING: You are about to deploy to PRODUCTION!"
    echo "   Production uses the image built by test deployment."
    echo
    read -r -p "Type 'PROD' to continue: " confirmation
    if [[ "${confirmation}" != "PROD" ]]; then
      echo "❌ Deployment cancelled."
      return 1
    fi
    echo
  fi

  echo "🔌 SSH ${ssh_target}:${PORT}"

  # Step 1: Update repository
  run_step "${ssh_target}" "Aktualizacja repo" "cd '${QNAP_REPO_DIR}' && git pull --ff-only"

  # Step 1b: Path diagnostics on QNAP
  run_step "${ssh_target}" "Diagnostyka ścieżek na QNAP" "cd '${QNAP_REPO_DIR}' && echo '--- QNAP PATH DIAGNOSTIC ---' && echo \"PWD: \$(pwd)\" && echo \"Git root: \$(git rev-parse --show-toplevel 2>/dev/null || echo '<no git root>')\" && echo \"QNAP_REPO_DIR: ${QNAP_REPO_DIR}\" && echo \"Expected copy-env path: ${QNAP_REPO_DIR}/03_scripts/nodejs/01_envs/copy-env.sh\" && echo \"Expected env qnap_test: ${QNAP_REPO_DIR}/.env.05_docker_qnap_test\" && echo \"Expected env qnap_prod: ${QNAP_REPO_DIR}/.env.06_docker_qnap_prod\" && echo '--- ls repo root ---' && ls -la && echo '--- ls 03_scripts ---' && ls -la 03_scripts || true && echo '--- ls 03_scripts/nodejs ---' && ls -la 03_scripts/nodejs || true && echo '--- ls 03_scripts/nodejs/01_envs ---' && ls -la 03_scripts/nodejs/01_envs || true && echo '--- file tests ---' && test -f '03_scripts/nodejs/01_envs/copy-env.sh' && echo 'OK: copy-env.sh exists relative to repo root' || echo 'MISSING: copy-env.sh relative to repo root' && test -f '${QNAP_REPO_DIR}/03_scripts/nodejs/01_envs/copy-env.sh' && echo 'OK: copy-env.sh exists absolute path' || echo 'MISSING: copy-env.sh absolute path' && test -f '.env.05_docker_qnap_test' && echo 'OK: .env.05_docker_qnap_test exists in repo root' || echo 'MISSING: .env.05_docker_qnap_test in repo root' && test -f '.env.06_docker_qnap_prod' && echo 'OK: .env.06_docker_qnap_prod exists in repo root' || echo 'MISSING: .env.06_docker_qnap_prod in repo root' && echo '--- git status short ---' && git status --short && echo '--- git ls-files copy-env ---' && git ls-files | grep 'copy-env.sh' || true && echo '--- END QNAP PATH DIAGNOSTIC ---'"

  # Step 2: Copy environment file to .env using copy-env.sh
  copy_remote_env "${ssh_target}" "${environment}"

  # Step 3: Build (only for test)
  if [[ "${will_build}" == "YES" ]]; then
    run_step "${ssh_target}" "Budowanie obrazów Docker" "cd '${docker_dir}' && bash './build_docker_image.sh'"
  else
    echo
    echo "ℹ️  Skipping build - prod uses image from test deployment"
    echo
  fi

  # Step 4: Stop old containers
  run_step "${ssh_target}" "Zatrzymywanie starych kontenerów" "cd '${docker_dir}' && bash './stop_docker_image.sh'"

  # Step 5: Start containers
  run_step "${ssh_target}" "Start kontenerów Docker" "cd '${docker_dir}' && bash './start_docker_image.sh'"

  echo
  echo "✅ Deploy ${environment} zakończony."
}

# Start/restart existing image without building
start_env() {
  local environment="${1:-}"
  local docker_dir
  local frontend_port
  local api_port
  local env_file_to_copy=""

  if [[ "${environment}" != "test" && "${environment}" != "prod" ]]; then
    echo "❌ Nieznane środowisko. Użyj: test albo prod."
    return 1
  fi

  local ssh_target="${USERNAME}@${HOST}"

  # Determine docker directory and ports based on environment
  if [[ "${environment}" == "prod" ]]; then
    docker_dir="${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}/${PROD_DOCKER_DIR}"
    frontend_port="12030"
    api_port="12034"
    env_file_to_copy=".env.06_docker_qnap_prod"
  else
    docker_dir="${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}/${TEST_DOCKER_DIR}"
    frontend_port="12020"
    api_port="12024"
    env_file_to_copy=".env.05_docker_qnap_test"
  fi

  # Show start summary
  echo
  echo "========================================"
  echo "📋 Start Summary"
  echo "========================================"
  echo "Environment:      ${environment}"
  echo "Mode:             START ONLY"
  echo "SSH Target:       ${ssh_target}:${PORT}"
  echo "QNAP Repo Dir:    ${QNAP_REPO_DIR}"
  echo "Project Name:     ${ENV_PROJECT_NAME}"
  echo "Scripts Root:     ${QNAP_REPO_DIR}/${SCRIPTS_ROOT_PATH}"
  echo "Docker Dir:       ${docker_dir}"
  echo "Frontend Port:    ${frontend_port}"
  echo "API Port:         ${api_port}"
  echo "Env file copied:  ${env_file_to_copy} -> .env"
  echo "Build Image:      NO"
  echo "Stop old:         YES, via start_docker_image.sh -> stop_docker_image.sh"
  echo "Start existing:   YES"
  if [[ "${environment}" == "prod" ]]; then
    echo "Image Tag:        latest (from test build)"
  fi
  echo "========================================"
  echo

  # Safety confirmation for prod
  if [[ "${environment}" == "prod" ]]; then
    echo "⚠️  WARNING: You are about to start PRODUCTION!"
    echo "   Production uses the image built by test deployment."
    echo
    read -r -p "Type 'PROD' to continue: " confirmation
    if [[ "${confirmation}" != "PROD" ]]; then
      echo "❌ Start cancelled."
      return 1
    fi
    echo
  fi

  echo "🔌 SSH ${ssh_target}:${PORT}"

  # Step 1: Update repository
  run_step "${ssh_target}" "Aktualizacja repo" "cd '${QNAP_REPO_DIR}' && git pull --ff-only"

  # Step 2: Path diagnostics on QNAP
  run_step "${ssh_target}" "Diagnostyka ścieżek na QNAP" "cd '${QNAP_REPO_DIR}' && echo '--- QNAP PATH DIAGNOSTIC ---' && echo \"PWD: \$(pwd)\" && pwd && echo \"Git root: \$(git rev-parse --show-toplevel 2>/dev/null || echo '<no git root>')\" && echo \"QNAP_REPO_DIR: ${QNAP_REPO_DIR}\" && echo \"Expected copy-env path: ${QNAP_REPO_DIR}/03_scripts/nodejs/01_envs/copy-env.sh\" && echo \"Expected env qnap_test: ${QNAP_REPO_DIR}/.env.05_docker_qnap_test\" && echo \"Expected env qnap_prod: ${QNAP_REPO_DIR}/.env.06_docker_qnap_prod\" && echo '--- ls repo root ---' && ls -la && echo '--- ls 03_scripts ---' && ls -la 03_scripts || true && echo '--- ls 03_scripts/nodejs ---' && ls -la 03_scripts/nodejs || true && echo '--- ls 03_scripts/nodejs/01_envs ---' && ls -la 03_scripts/nodejs/01_envs || true && echo '--- file tests ---' && test -f '03_scripts/nodejs/01_envs/copy-env.sh' && echo 'OK: copy-env.sh exists relative to repo root' || echo 'MISSING: copy-env.sh relative to repo root' && test -f '${QNAP_REPO_DIR}/03_scripts/nodejs/01_envs/copy-env.sh' && echo 'OK: copy-env.sh exists absolute path' || echo 'MISSING: copy-env.sh absolute path' && test -f '.env.05_docker_qnap_test' && echo 'OK: .env.05_docker_qnap_test exists in repo root' || echo 'MISSING: .env.05_docker_qnap_test in repo root' && test -f '.env.06_docker_qnap_prod' && echo 'OK: .env.06_docker_qnap_prod exists in repo root' || echo 'MISSING: .env.06_docker_qnap_prod in repo root' && echo '--- git status short ---' && git status --short && echo '--- git ls-files copy-env ---' && git ls-files | grep 'copy-env.sh' || true && echo '--- END QNAP PATH DIAGNOSTIC ---'"

  # Step 3: Copy environment file to .env using copy-env.sh
  copy_remote_env "${ssh_target}" "${environment}"

  # Step 4: Start containers (start_docker_image.sh handles stop internally)
  run_step "${ssh_target}" "Start kontenerów Docker" "cd '${docker_dir}' && bash './start_docker_image.sh'"

  echo
  echo "✅ Start ${environment} zakończony."
}
