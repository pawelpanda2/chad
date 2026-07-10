#!/bin/bash
set -e

# ==========================================
# Run DataLib.AppHost via Aspire for local Mac environment
# ==========================================
# This script is the official way to run the application locally via Aspire.
# It sets up environment variables and starts the Aspire AppHost.
# ==========================================

# 1. Find script directory and repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "SCRIPT_DIR: $SCRIPT_DIR"

# Script is in: content-provider/03_scripts/02_local-mac_aspire
# We need to go up 3 levels to get to the repo root (personal-dashboard)
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
echo "REPO_ROOT: $REPO_ROOT"

# 2. Set paths - updated for content-provider structure
CONTENT_PROVIDER_DIR="$REPO_ROOT/content-provider"
CONTENT_PROVIDER_ENV_SOURCE="$CONTENT_PROVIDER_DIR/.env.local-mac.aspire"
CONTENT_PROVIDER_ENV_EXAMPLE="$CONTENT_PROVIDER_DIR/.env.local-mac.aspire.example"
CONTENT_PROVIDER_ENV_TARGET="$CONTENT_PROVIDER_DIR/.env"
ASPIRE_PROJECT_DIR="$CONTENT_PROVIDER_DIR/aspire/DataLib.AppHost"

echo "CONTENT_PROVIDER_DIR: $CONTENT_PROVIDER_DIR"
echo "ASPIRE_PROJECT_DIR: $ASPIRE_PROJECT_DIR"

# 3. Check if .env.local-mac.aspire exists, create from example if not
if [ ! -f "$CONTENT_PROVIDER_ENV_SOURCE" ]; then
    echo ""
    echo "⚠️ Plik $CONTENT_PROVIDER_ENV_SOURCE nie istnieje."
    echo ""
    if [ -f "$CONTENT_PROVIDER_ENV_EXAMPLE" ]; then
        echo "   Znaleziono szablon: $CONTENT_PROVIDER_ENV_EXAMPLE"
        echo "   Kopiowanie szablonu..."
        cp "$CONTENT_PROVIDER_ENV_EXAMPLE" "$CONTENT_PROVIDER_ENV_SOURCE"
    else
        echo "   Tworzenie domyślnego pliku .env.local-mac.aspire..."
        cat > "$CONTENT_PROVIDER_ENV_SOURCE" << 'EOF'
# Content Provider API Port
CONTENT_PROVIDER_API_PORT=12024

# Content Provider Root (path to cp-root directory)
# This should point to the cp-root directory in the repository
CONTENT_PROVIDER_ROOT=
EOF
        echo "   Utworzono plik: $CONTENT_PROVIDER_ENV_SOURCE"
        echo ""
        echo "   Przed uruchomieniem należy edytować plik i ustawić CONTENT_PROVIDER_ROOT."
        echo "   Następnie uruchom ponownie ten skrypt."
        exit 1
    fi
fi

# Copy .env.local-mac.aspire to .env
echo ""
echo "📋 Kopiowanie $CONTENT_PROVIDER_ENV_SOURCE do $CONTENT_PROVIDER_ENV_TARGET..."
cp "$CONTENT_PROVIDER_ENV_SOURCE" "$CONTENT_PROVIDER_ENV_TARGET"
echo "✅ Skopiowano plik .env"

# 4. Read CONTENT_PROVIDER_API_PORT from .env
API_PORT=$(grep "^CONTENT_PROVIDER_API_PORT=" "$CONTENT_PROVIDER_ENV_TARGET" | cut -d'=' -f2-)

if [ -z "$API_PORT" ]; then
    echo "❌ Błąd: CONTENT_PROVIDER_API_PORT nie jest zdefiniowane w $CONTENT_PROVIDER_ENV_TARGET"
    exit 1
fi

echo "🔧 CONTENT_PROVIDER_API_PORT: $API_PORT"

# 5. Check if ports are available
ASPIRE_DASHBOARD_PORT=22267
echo ""
echo "🔍 Sprawdzanie dostępności portów..."

check_port() {
    local port=$1
    local name=$2
    
    if lsof -i :$port >/dev/null 2>&1; then
        echo "❌ Port $port ($name) jest zajęty!"
        echo ""
        echo "   Zajęty przez:"
        lsof -i :$port 2>/dev/null || echo "   (nie można określić procesu)"
        echo ""
        echo "   Aby zwolnić port, wykonaj:"
        local pid=$(lsof -t -i :$port 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
            echo "   kill $pid"
            echo "   lub jeśli nie działa: kill -9 $pid"
        fi
        echo ""
        return 1
    fi
    echo "✅ Port $port ($name) jest wolny"
    return 0
}

PORTS_AVAILABLE=true

# Check Aspire Dashboard port
if ! check_port $ASPIRE_DASHBOARD_PORT "Aspire Dashboard"; then
    echo ""
    echo "❌ Nie można uruchomić Aspire - port dashboardu jest zajęty."
    echo "   Prawdopodobnie działa poprzednia instancja Aspire."
    echo "   Zwolnij port $ASPIRE_DASHBOARD_PORT i uruchom skrypt ponownie."
    exit 1
fi

# Check Content Provider API port
if ! check_port $API_PORT "Content Provider API"; then
    echo ""
    echo "❌ Nie można uruchomić Content Provider API - port jest zajęty."
    echo "   Frontend będzie miał Connection Error, jeśli API nie wystartuje na porcie $API_PORT."
    echo "   Zwolnij port $API_PORT i uruchom skrypt ponownie."
    exit 1
fi

echo ""
echo "✅ Wszystkie porty są wolne - można uruchomić Aspire"

# 6. Print summary
echo ""
echo "=========================================="
echo "Podsumowanie konfiguracji:"
echo "=========================================="
echo "  SCRIPT_DIR:              $SCRIPT_DIR"
echo "  REPO_ROOT:               $REPO_ROOT"
echo "  Content Provider dir:    $CONTENT_PROVIDER_DIR"
echo "  Env source:              $CONTENT_PROVIDER_ENV_SOURCE"
echo "  Env target:              $CONTENT_PROVIDER_ENV_TARGET"
echo "  CONTENT_PROVIDER_API_PORT: $API_PORT"
echo "  Aspire Dashboard:        http://localhost:$ASPIRE_DASHBOARD_PORT"
echo "  Blazor Frontend:         (dynamiczny port)"
echo "  Content Provider API:    http://localhost:$API_PORT"
echo "=========================================="
echo ""

# 7. Navigate to aspire project (global.json will take effect after cd)
cd "$ASPIRE_PROJECT_DIR"

# 8. Verify .NET 8 is being used (global.json should handle this after cd)
DOTNET_VERSION=$(dotnet --version 2>/dev/null || echo "unknown")
echo "🔍 .NET SDK version: $DOTNET_VERSION"

if [[ "$DOTNET_VERSION" != 8.* ]]; then
    echo ""
    echo "❌ BŁĄD: Wymagane .NET 8 SDK, a wykryto $DOTNET_VERSION"
    echo ""
    echo "   Projekt używa global.json w content-provider/ aby wymusić .NET 8."
    echo "   Upewnij się, że .NET 8 SDK jest zainstalowane:"
    echo "   https://dotnet.microsoft.com/download/dotnet/8.0"
    echo ""
    echo "   Dostępne SDK:"
    dotnet --list-sdks
    echo ""
    exit 1
fi

echo "✅ Używam .NET $DOTNET_VERSION"

# 9. Run Aspire
echo "🚀 Uruchamianie DataLib.AppHost przez Aspire..."
echo "   (naciśnij Ctrl+C, aby zatrzymać)"
echo ""

# Pass REPO_ROOT to the application so it can find the .env file
export REPO_ROOT="$REPO_ROOT"
export CONTENT_PROVIDER_API_PORT="$API_PORT"

dotnet run --project DataLib.AppHost.csproj
