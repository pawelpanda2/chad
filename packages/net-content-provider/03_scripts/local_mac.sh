#!/bin/bash

# local_mac.sh - Skrypt uruchamiający frontend i backend na macOS
# Wymagania: .NET SDK, Node.js, npm

set -e

# Kolory do outputu
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Ścieżka do katalogu projektu (zakładamy że skrypt jest w 03_scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=== Content Provider - Local Development ===${NC}"
echo -e "Project root: ${PROJECT_ROOT}"

# Funkcja do sprawdzania czy proces działa
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# Funkcja do zabijania procesu na porcie
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Killing process on port $port (PID: $pid)${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
}

# Czyszczenie portów przed uruchomieniem
echo -e "${YELLOW}Cleaning up ports...${NC}"
kill_port 12024  # Backend API
kill_port 5503   # Frontend Next.js

# Sprawdzanie zależności
echo -e "${YELLOW}Checking dependencies...${NC}"

if ! command -v dotnet &> /dev/null; then
    echo -e "${RED}Error: .NET SDK not found. Please install .NET SDK.${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found. Please install Node.js.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm not found. Please install Node.js (includes npm).${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All dependencies found${NC}"

# Uruchamianie backendu
echo -e "${YELLOW}Starting backend...${NC}"
cd "$PROJECT_ROOT/api_charp/SharpContainerApi"

# Build backendu (opcjonalne, przyspiesza pierwsze uruchomienie)
if [ ! -d "bin" ]; then
    echo -e "${YELLOW}Building backend (first time may take a while)...${NC}"
    dotnet build -c Release
fi

# Uruchomienie backendu w tle
echo -e "${BLUE}Backend will run on http://localhost:12024${NC}"
dotnet run -c Release &
BACKEND_PID=$!

# Czekanie aż backend się uruchomi
echo -e "${YELLOW}Waiting for backend to start...${NC}"
max_attempts=30
attempt=0
while ! check_port 12024 && [ $attempt -lt $max_attempts ]; do
    sleep 1
    attempt=$((attempt + 1))
    echo -n "."
done
echo ""

if check_port 12024; then
    echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}✗ Backend failed to start${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Uruchamianie frontendu
echo -e "${YELLOW}Starting frontend...${NC}"
cd "$PROJECT_ROOT/front_nextjs"

# Instalacja zależności (jeśli potrzeba)
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Uruchomienie frontendu w tle
echo -e "${BLUE}Frontend will run on http://localhost:5503${NC}"
npm run dev &
FRONTEND_PID=$!

# Czekanie aż frontend się uruchomi
echo -e "${YELLOW}Waiting for frontend to start...${NC}"
max_attempts=20
attempt=0
while ! check_port 5503 && [ $attempt -lt $max_attempts ]; do
    sleep 1
    attempt=$((attempt + 1))
    echo -n "."
done
echo ""

if check_port 5503; then
    echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${RED}✗ Frontend failed to start${NC}"
    kill $FRONTEND_PID 2>/dev/null || true
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Podsumowanie
echo ""
echo -e "${GREEN}=== All services started successfully! ===${NC}"
echo ""
echo -e "${BLUE}Frontend:${NC} http://localhost:5503"
echo -e "${BLUE}Backend API:${NC} http://localhost:12024"
echo -e "${BLUE}Health check:${NC} http://localhost:12024/health"
echo ""
echo -e "${YELLOW}PIDs:${NC}"
echo -e "  Backend: $BACKEND_PID"
echo -e "  Frontend: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}To stop all services, press Ctrl+C or run:${NC}"
echo -e "  kill $BACKEND_PID $FRONTEND_PID"
echo ""

# Czekanie na zakończenie (Ctrl+C)
wait