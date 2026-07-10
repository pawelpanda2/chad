#!/bin/bash
# run_dev.sh - Local development workflow for front_nextjs
# 
# This script:
# 1. Copies local env configuration
# 2. Checks if backend is healthy
# 3. Starts backend if not running
# 4. Waits for backend to be healthy
# 5. Starts Next.js frontend
# 6. Cleans up backend on exit (if started by this script)

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory and project roots
# Go up: 02_local_mac -> nodejs -> 03_scripts -> front_nextjs (3 levels up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROJECT_ROOT="$(cd "$FRONTEND_ROOT/.." && pwd)"
CONTENT_PROVIDER_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

# Temp directory for PID and logs
TMP_DIR="$FRONTEND_ROOT/.tmp"
mkdir -p "$TMP_DIR"

PID_FILE="$TMP_DIR/content-provider-api.local.pid"
LOG_FILE="$TMP_DIR/content-provider-api.local.log"

# Track if we started the backend ourselves
BACKEND_STARTED_BY_US=false

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    if [ "$BACKEND_STARTED_BY_US" = true ] && [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${YELLOW}Stopping backend (PID: $PID)...${NC}"
            kill "$PID" 2>/dev/null || true
            sleep 2
            # Force kill if still running
            if kill -0 "$PID" 2>/dev/null; then
                kill -9 "$PID" 2>/dev/null || true
            fi
        fi
        rm -f "$PID_FILE"
    fi
    echo -e "${YELLOW}Done. Goodbye!${NC}"
    exit 0
}

# Set up trap for Ctrl+C
trap cleanup INT TERM

# Function to check if backend is healthy
check_backend_health() {
    local url="$1"
    curl -fsS "${url}/health" > /dev/null 2>&1
    return $?
}

# Function to wait for backend to be healthy
wait_for_backend() {
    local url="$1"
    local max_attempts="${2:-60}"
    local attempt=0
    
    echo -e "${YELLOW}Waiting for backend to start...${NC}"
    while [ $attempt -lt $max_attempts ]; do
        if check_backend_health "$url"; then
            echo -e "${GREEN}✓ Backend is healthy${NC}"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
        echo -n "."
    done
    echo ""
    return 1
}

# Function to start backend
start_backend() {
    local api_port="$1"
    local api_url="$2"
    
    echo -e "${BLUE}Starting Content Provider API...${NC}"
    
    # Check if dotnet is available
    if ! command -v dotnet &> /dev/null; then
        echo -e "${RED}Error: .NET SDK not found. Please install .NET SDK.${NC}"
        exit 1
    fi
    
    # Find the API project
    local api_project="$PROJECT_ROOT/api_charp/SharpContainerApi/SharpContainerApi.csproj"
    if [ ! -f "$api_project" ]; then
        echo -e "${RED}Error: API project not found at $api_project${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}API project: $api_project${NC}"
    echo -e "${YELLOW}API port: $api_port${NC}"
    echo -e "${YELLOW}Content Provider Root: $CONTENT_PROVIDER_ROOT${NC}"
    
    # Build if needed
    if [ ! -d "$(dirname "$api_project")/bin" ]; then
        echo -e "${YELLOW}Building API (first time may take a while)...${NC}"
        dotnet build "$api_project" -c Release
    fi
    
    # Start backend in background
    CONTENT_PROVIDER_ROOT="$CONTENT_PROVIDER_ROOT" \
    CONTENT_PROVIDER_API_PORT="$api_port" \
    ASPNETCORE_URLS="http://localhost:${api_port}" \
    dotnet run --project "$api_project" -c Release > "$LOG_FILE" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$PID_FILE"
    BACKEND_STARTED_BY_US=true
    
    echo -e "${BLUE}Backend started with PID: $pid${NC}"
    echo -e "${BLUE}Log file: $LOG_FILE${NC}"
}

# Main script starts here
echo -e "${BLUE}=== Content Provider Frontend - Local Development ===${NC}"
echo -e "Project root: ${PROJECT_ROOT}"
echo ""

# Step 1: Copy environment configuration
echo -e "${YELLOW}Setting up environment...${NC}"
bash "$SCRIPT_DIR/../01_envs/copy-env.sh" local_mac

# Step 2: Load environment variables
if [ -f "$FRONTEND_ROOT/.env" ]; then
    set -a
    source "$FRONTEND_ROOT/.env"
    set +a
else
    echo -e "${RED}Error: .env file not found after copying${NC}"
    exit 1
fi

# Set defaults if not set
FRONTEND_PORT="${FRONTEND_PORT:-5503}"
CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"
CONTENT_PROVIDER_API_URL="${CONTENT_PROVIDER_API_URL:-http://localhost:${CONTENT_PROVIDER_API_PORT}}"
NEXT_PUBLIC_CONTENT_API_URL="${NEXT_PUBLIC_CONTENT_API_URL:-http://localhost:${CONTENT_PROVIDER_API_PORT}}"

echo -e "${BLUE}Configuration:${NC}"
echo -e "  Frontend port: ${FRONTEND_PORT}"
echo -e "  Backend API URL: ${CONTENT_PROVIDER_API_URL}"
echo -e "  Content Provider Root: ${CONTENT_PROVIDER_ROOT}"
echo ""

# Step 3: Check if backend is already running
echo -e "${YELLOW}Checking backend health...${NC}"
if check_backend_health "$CONTENT_PROVIDER_API_URL"; then
    echo -e "${GREEN}✓ Backend is already running and healthy${NC}"
else
    echo -e "${YELLOW}Backend not responding, starting it...${NC}"
    start_backend "$CONTENT_PROVIDER_API_PORT" "$CONTENT_PROVIDER_API_URL"
    
    # Step 4: Wait for backend to be healthy
    if ! wait_for_backend "$CONTENT_PROVIDER_API_URL" 60; then
        echo -e "${RED}✗ Backend failed to start${NC}"
        echo -e "${RED}Last 80 lines of log:${NC}"
        tail -80 "$LOG_FILE" 2>/dev/null || true
        exit 1
    fi
fi

echo ""

# Step 5: Start Next.js frontend
echo -e "${BLUE}Starting Next.js frontend...${NC}"
echo -e "${BLUE}Frontend will run on http://localhost:${FRONTEND_PORT}${NC}"
echo ""

cd "$FRONTEND_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Start Next.js (this will run in foreground)
PORT="$FRONTEND_PORT" npm run dev