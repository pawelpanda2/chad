#!/usr/bin/env bash

set -euo pipefail

# Standard path resolution pattern for 03_scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"

echo "[INFO] Uruchamianie projektu: shacn-nextjs-dashboard"
echo "[INFO] Katalog projektu: ${PROJECT_ROOT_DIR}"

# Check if node is installed
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node nie jest zainstalowany."
  exit 1
fi

# Check if npm is available
if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm nie jest zainstalowany."
  exit 1
fi

# Check if package.json exists
if [[ ! -f "${PROJECT_ROOT_DIR}/package.json" ]]; then
  echo "[ERROR] Nie znaleziono package.json w: ${PROJECT_ROOT_DIR}"
  exit 1
fi

# Load environment from .env.02_local_mac if exists
ENV_FILE="${PROJECT_ROOT_DIR}/.env.02_local_mac"
if [[ -f "${ENV_FILE}" ]]; then
  echo "[INFO] Ładowanie środowiska z: ${ENV_FILE}"
  set -a
  source "${ENV_FILE}"
  set +a
elif [[ -f "${PROJECT_ROOT_DIR}/.env" ]]; then
  echo "[INFO] Ładowanie środowiska z: ${PROJECT_ROOT_DIR}/.env"
  set -a
  source "${PROJECT_ROOT_DIR}/.env"
  set +a
fi

# Set CONTENT_PROVIDER_ROOT dynamically (not stored in .env file)
export CONTENT_PROVIDER_ROOT="${PROJECT_ROOT_DIR}/cp-root"
echo "[INFO] CONTENT_PROVIDER_ROOT: ${CONTENT_PROVIDER_ROOT}"

# Set default ports if not defined
FRONTEND_PORT="${FRONTEND_PORT:-12080}"
CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"

# Set Content Provider API URL for local Mac (localhost, not Docker network)
CONTENT_PROVIDER_API_URL="${CONTENT_PROVIDER_API_URL:-http://localhost:${CONTENT_PROVIDER_API_PORT}}"

# Prepare .env from .env.02_local_mac for local dev
# This ensures Content Provider API and Next.js read the same local env
# and not some stale QNAP env
LOCAL_ENV_FILE="${PROJECT_ROOT_DIR}/.env.02_local_mac"
MAIN_ENV_FILE="${PROJECT_ROOT_DIR}/.env"
if [[ -f "${LOCAL_ENV_FILE}" ]]; then
  echo "[INFO] Preparing .env from .env.02_local_mac..."
  cp "${LOCAL_ENV_FILE}" "${MAIN_ENV_FILE}"
  
  # Validate the copied .env
  if ! bash -c "set -a; source '${MAIN_ENV_FILE}'; set +a" 2>/dev/null; then
    echo "[WARN] .env may have issues. Check first line for proper # comment."
  fi
else
  echo "[WARN] .env.02_local_mac not found. Using existing .env if present."
fi

# Create .tmp directory for PID and logs
TMP_DIR="${PROJECT_ROOT_DIR}/.tmp"
mkdir -p "${TMP_DIR}"

# Track if we started the CP API ourselves (via Docker)
CP_API_STARTED_BY_US=false
CP_API_CONTAINER_NAME="cp_api"

# Print environment info (without secrets)
echo "[INFO] Environment configuration:"
echo "  - FRONTEND_PORT: ${FRONTEND_PORT}"
echo "  - CONTENT_PROVIDER_API_PORT: ${CONTENT_PROVIDER_API_PORT}"
echo "  - CONTENT_PROVIDER_API_URL: ${CONTENT_PROVIDER_API_URL}"
echo "  - CONTENT_PROVIDER_ROOT: ${CONTENT_PROVIDER_ROOT}"
echo "  - NODE_ENV: ${NODE_ENV:-not set}"

# Check if cp-root directory exists
if [[ ! -d "${CONTENT_PROVIDER_ROOT}" ]]; then
  echo "[WARN] cp-root directory does not exist: ${CONTENT_PROVIDER_ROOT}"
  echo "[WARN] Content Provider API may not work correctly."
fi

# Function to check if Content Provider API is reachable
check_cp_api_health() {
  curl -fsS --max-time 3 "${CONTENT_PROVIDER_API_URL}/health" >/dev/null 2>&1
}

# Function to start Content Provider API using Docker from ../content-provider
start_cp_api_docker() {
  # Path to the content-provider project (sibling directory)
  local cp_project_dir
  cp_project_dir="$(cd "${PROJECT_ROOT_DIR}/../content-provider" && pwd)"
  local cp_scripts_dir="${cp_project_dir}/03_scripts/03_local-mac_docker"
  
  echo "[INFO] Starting Content Provider API using Docker..."
  echo "[INFO] Content Provider project: ${cp_project_dir}"
  
  # Check if Docker is available
  if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Docker is not installed or not in PATH."
    exit 1
  fi
  
  # Check if the docker scripts exist
  if [[ ! -f "${cp_scripts_dir}/01_image_api_charp.sh" ]] || [[ ! -f "${cp_scripts_dir}/02_run_api_charp.sh" ]]; then
    echo "[ERROR] Docker scripts not found in ${cp_scripts_dir}"
    exit 1
  fi
  
  # Check if .env exists in content-provider
  if [[ ! -f "${cp_project_dir}/.env" ]]; then
    echo "[WARN] .env not found in ${cp_project_dir}"
    echo "[INFO] Creating .env from .env.local-mac.docker.example..."
    if [[ -f "${cp_project_dir}/.env.local-mac.docker.example" ]]; then
      cp "${cp_project_dir}/.env.local-mac.docker.example" "${cp_project_dir}/.env"
    else
      echo "[ERROR] .env.local-mac.docker.example not found either."
      exit 1
    fi
  fi
  
  # Step 1: Build Docker image
  echo "[INFO] Building Docker image..."
  if ! bash "${cp_scripts_dir}/01_image_api_charp.sh"; then
    echo "[ERROR] Failed to build Docker image."
    exit 1
  fi
  
  # Step 2: Run Docker container
  echo "[INFO] Starting Docker container..."
  if ! bash "${cp_scripts_dir}/02_run_api_charp.sh"; then
    echo "[ERROR] Failed to start Docker container."
    exit 1
  fi
  
  CP_API_STARTED_BY_US=true
  echo "[INFO] Content Provider API Docker container started."
}

# Function to wait for Content Provider API to become healthy
wait_for_cp_api() {
  local max_attempts=30
  local attempt=1
  local delay=2

  echo "[INFO] Waiting for Content Provider API to become healthy..."

  while [[ ${attempt} -le ${max_attempts} ]]; do
    if check_cp_api_health; then
      return 0
    fi
    echo "  Attempt ${attempt}/${max_attempts}..."
    sleep "${delay}"
    attempt=$((attempt + 1))
  done

  return 1
}

# Cleanup function
cleanup() {
  echo
  echo "[INFO] Zatrzymywanie serwisów..."

  # Stop CP API if we started it (Docker)
  if [[ "${CP_API_STARTED_BY_US}" == "true" ]]; then
    echo "[INFO] Stopping Content Provider API Docker container (${CP_API_CONTAINER_NAME})..."
    docker stop "${CP_API_CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CP_API_CONTAINER_NAME}" 2>/dev/null || true
  fi

  # Stop Next.js dev server
  if [[ -n "${DEV_PID:-}" ]] && kill -0 "${DEV_PID}" >/dev/null 2>&1; then
    kill "${DEV_PID}" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  echo "[INFO] Zakonczono."
}

trap cleanup INT TERM EXIT

# Step 1: Check if Content Provider API is already running
echo "[INFO] Checking Content Provider API health..."
if check_cp_api_health; then
  echo "[OK] Content Provider API is already running at ${CONTENT_PROVIDER_API_URL}"
else
  echo "[WARN] Content Provider API is not reachable at ${CONTENT_PROVIDER_API_URL}"
  echo "[INFO] Attempting to start Content Provider API using Docker from ../content-provider..."
  
  start_cp_api_docker

  # Wait for it to become healthy
  if ! wait_for_cp_api; then
    echo ""
    echo "❌ Content Provider API failed to start or is not healthy after starting Docker container."
    echo ""
    echo "Debugging information:"
    echo "----------------------------------------"
    echo "curl http://localhost:${CONTENT_PROVIDER_API_PORT}/health failed"
    echo ""
    echo "docker ps:"
    docker ps -a 2>/dev/null || echo "(docker not available)"
    echo ""
    echo "docker logs ${CP_API_CONTAINER_NAME}:"
    docker logs "${CP_API_CONTAINER_NAME}" 2>&1 | tail -n 80 || echo "(container not found or no logs)"
    echo "----------------------------------------"
    echo ""
    exit 1
  fi

  echo "[OK] Content Provider API is reachable at ${CONTENT_PROVIDER_API_URL}"
fi

# Step 2: Check if node_modules exists, if not install dependencies
if [[ ! -d "${PROJECT_ROOT_DIR}/node_modules" ]]; then
  echo "[INFO] Brak node_modules. Instalacja zaleznosci..."
  (cd "${PROJECT_ROOT_DIR}" && npm install)
fi

# Step 3: Check if port is available and kill any processes using it
echo "[INFO] Checking if port ${FRONTEND_PORT} is available..."
if lsof -i :${FRONTEND_PORT} >/dev/null 2>&1; then
  echo ""
  echo "⚠️  Port ${FRONTEND_PORT} is already in use. Killing processes..."
  echo ""
  echo "Processes using port ${FRONTEND_PORT}:"
  lsof -i :${FRONTEND_PORT}
  echo ""
  
  # First, check if it's a Docker container using this port
  if command -v docker >/dev/null 2>&1; then
    echo "[INFO] Checking if a Docker container is using this port..."
    
    # Find container using this port
    CONTAINER_ON_PORT=$(docker ps --format "{{.Names}}\t{{.Ports}}" | grep ":${FRONTEND_PORT}->" | cut -f1)
    
    if [[ -n "${CONTAINER_ON_PORT}" ]]; then
      echo "🐳 Found Docker container '${CONTAINER_ON_PORT}' using port ${FRONTEND_PORT}"
      echo "[INFO] Stopping and removing container to free up port..."
      
      # Stop and remove the container
      docker stop "${CONTAINER_ON_PORT}" 2>/dev/null || true
      docker rm -f "${CONTAINER_ON_PORT}" 2>/dev/null || true
      
      echo "✅ Container '${CONTAINER_ON_PORT}' removed."
      echo ""
      
      # Verify port is now free
      sleep 2
      if lsof -i :${FRONTEND_PORT} >/dev/null 2>&1; then
        echo "[WARN] Port still in use after removing container. Killing remaining processes..."
      else
        echo "✅ Port ${FRONTEND_PORT} is now free."
      fi
    fi
  fi
  
  # Kill any remaining processes using the port (including node, Code Helper, etc.)
  if lsof -i :${FRONTEND_PORT} >/dev/null 2>&1; then
    echo "[INFO] Killing remaining processes on port ${FRONTEND_PORT}..."
    
    # Get PIDs of processes using the port (exclude CLOSED connections)
    PIDS=$(lsof -ti :${FRONTEND_PORT} 2>/dev/null || true)
    
    if [[ -n "${PIDS}" ]]; then
      for PID in ${PIDS}; do
        PROCESS_NAME=$(ps -p "${PID}" -o comm= 2>/dev/null || echo "unknown")
        echo "  Killing PID ${PID} (${PROCESS_NAME})..."
        kill "${PID}" 2>/dev/null || true
      done
      
      # Wait a moment for processes to terminate
      sleep 2
      
      # Force kill if still running
      if lsof -i :${FRONTEND_PORT} >/dev/null 2>&1; then
        echo "[WARN] Some processes still running. Force killing..."
        for PID in ${PIDS}; do
          kill -9 "${PID}" 2>/dev/null || true
        done
        sleep 1
      fi
    fi
    
    # Final check
    if lsof -i :${FRONTEND_PORT} >/dev/null 2>&1; then
      echo "❌ Failed to free port ${FRONTEND_PORT}. Please kill processes manually:"
      lsof -i :${FRONTEND_PORT}
      exit 1
    else
      echo "✅ Port ${FRONTEND_PORT} is now free."
    fi
  fi
fi

# Step 3: Start Next.js dev server
echo "[INFO] Uruchamianie serwera deweloperskiego (npm run dev)"
(
  cd "${PROJECT_ROOT_DIR}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
DEV_PID=$!

echo "[INFO] Serwer deweloperski uruchomiony."
echo "- Adres: http://localhost:${FRONTEND_PORT}"
echo "- Dashboard: http://localhost:${FRONTEND_PORT}/dashboard"
echo "- Content Provider API: ${CONTENT_PROVIDER_API_URL}"
echo "Nacisnij Ctrl+C aby zatrzymac serwer."

wait "${DEV_PID}"