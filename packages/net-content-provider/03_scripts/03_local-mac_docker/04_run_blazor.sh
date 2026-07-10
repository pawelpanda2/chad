#!/bin/bash

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "SCRIPT_DIR: $SCRIPT_DIR"

# Katalog główny repozytorium
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
echo "REPO_ROOT: $REPO_ROOT"

# Ścieżka do pliku .env
ENV_FILE="$REPO_ROOT/.env"

# Sprawdź czy plik .env istnieje
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Błąd: Plik .env nie istnieje w $ENV_FILE"
    echo "   Skopiuj .env.local-mac.docker.example do .env i dostosuj konfigurację:"
    echo "   cp $REPO_ROOT/.env.local-mac.docker.example $ENV_FILE"
    exit 1
fi

# Załaduj zmienne z .env
set -a
source "$ENV_FILE"
set +a
echo "✅ Załadono zmienne z .env"

# Ustaw domyślne wartości jeśli nie są ustawione
CONTENT_PROVIDER_API_PORT=${CONTENT_PROVIDER_API_PORT:-12024}
CONTENT_PROVIDER_ASSEMBLY_IMAGE_PREFIX=${CONTENT_PROVIDER_ASSEMBLY_IMAGE_PREFIX:-cp_blazor}
CONTENT_PROVIDER_ASSEMBLY_CONTAINER_NAME=${CONTENT_PROVIDER_ASSEMBLY_CONTAINER_NAME:-cp_blazor}
CONTENT_PROVIDER_ASSEMBLY_HOST_PORT=${CONTENT_PROVIDER_ASSEMBLY_HOST_PORT:-12020}
CONTENT_PROVIDER_ASSEMBLY_CONTAINER_PORT=${CONTENT_PROVIDER_ASSEMBLY_CONTAINER_PORT:-80}

NAME="$CONTENT_PROVIDER_ASSEMBLY_CONTAINER_NAME"

# Funkcja znajdująca obraz z najnowszym tagiem na podstawie prefixu
# Tagi mają format YYMMDD_HHMMSS, więc sortowanie alfanumeryczne daje poprawną kolejność czasową
find_latest_image() {
    local image_prefix="$1"
    
    # Pobierz wszystkie obrazy pasujące do prefixu, posortowane po tagu (najnowszy pierwszy)
    # Format taga: YYMMDD_HHMMSS - sortowanie malejące daje najnowszy obraz
    local latest_image
    latest_image=$(docker images --format "{{.Repository}}:{{.Tag}}" | \
        grep "^${image_prefix}:" | \
        sort -t':' -k2,2r | \
        head -n 1)
    
    echo "$latest_image"
}

# Znajdź najnowszy obraz
IMAGE=$(find_latest_image "$CONTENT_PROVIDER_ASSEMBLY_IMAGE_PREFIX")

if [ -z "$IMAGE" ]; then
    echo "❌ Błąd: Nie znaleziono żadnego obrazu Docker z prefixem '$CONTENT_PROVIDER_ASSEMBLY_IMAGE_PREFIX'"
    echo "   Uruchom najpierw skrypt buildowania obrazu:"
    echo "   $SCRIPT_DIR/03_image_assembly.sh"
    exit 1
fi

echo "🔍 Sprawdzam czy kontener $NAME już istnieje..."

# Sprawdź czy kontener istnieje (uruchomiony lub zatrzymany)
if docker ps -a --format "table {{.Names}}" | grep -q "^$NAME$"; then
    echo "⚠️  Kontener $NAME już istnieje"
    
    # Zatrzymaj kontener jeśli działa
    if docker ps --format "table {{.Names}}" | grep -q "^$NAME$"; then
        echo "🛑 Zatrzymuję kontener $NAME..."
        docker stop $NAME
    fi
    
    # Usuń kontener
    echo "🗑️  Usuwam kontener $NAME..."
    docker rm $NAME
    
    echo "✅ Stary kontener $NAME został usunięty"
else
    echo "ℹ️  Kontener $NAME nie istnieje - można utworzyć nowy"
fi

echo "🚀 Uruchamiam kontener $NAME z obrazu: $IMAGE"
echo "   Port: $CONTENT_PROVIDER_ASSEMBLY_HOST_PORT:$CONTENT_PROVIDER_ASSEMBLY_CONTAINER_PORT"
echo "   🌐 Blazor App: http://localhost:$CONTENT_PROVIDER_ASSEMBLY_HOST_PORT"
echo "   🔧 Backend API: http://localhost:$CONTENT_PROVIDER_API_PORT"
docker run -d \
  --name $NAME \
  --restart unless-stopped \
  -p $CONTENT_PROVIDER_ASSEMBLY_HOST_PORT:$CONTENT_PROVIDER_ASSEMBLY_CONTAINER_PORT \
  $IMAGE