#!/bin/bash

# ============================================
# Uruchamianie kontenera cp_blazor z Docker Hub
# ============================================
# Użycie:
#   ./01_run_assembly.sh           # uruchom z tagiem latest
#   ./01_run_assembly.sh 260615_194030  # uruchom z konkretnym tagiem datowym
# ============================================

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Katalog główny repozytorium (content-provider/)
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Konfiguracja Docker Hub - zmień na swój login
DOCKERHUB_USER="${DOCKERHUB_USER:-pawelfluder}"

# Tag - pobierz z argumentu lub użyj latest
TAG="${1:-latest}"

# Nazwy obrazów i kontenera
IMAGE="${DOCKERHUB_USER}/cp_blazor:${TAG}"
NAME="cp_blazor"

# Porty
HOST_PORT="${CONTENT_PROVIDER_ASSEMBLY_HOST_PORT:-8080}"
CONTAINER_PORT="${CONTENT_PROVIDER_ASSEMBLY_CONTAINER_PORT:-80}"

# ============================================
# Informacje
# ============================================
echo "============================================"
echo "🚀 Uruchamianie kontenera cp_blazor"
echo "============================================"
echo "Project root:  $REPO_ROOT"
echo "Image:         $IMAGE"
echo "Container:     $NAME"
echo "Port:          $HOST_PORT:$CONTAINER_PORT"
echo "Tag:           $TAG"
echo "============================================"

# Sprawdź czy kontener istnieje (uruchomiony lub zatrzymany)
echo "🔍 Sprawdzam czy kontener $NAME już istnieje..."

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

# Uruchom nowy kontener
echo "🚀 Uruchamiam kontener $NAME z obrazu: $IMAGE"
docker run -d \
  --name $NAME \
  --restart unless-stopped \
  -p $HOST_PORT:$CONTAINER_PORT \
  $IMAGE

if [ $? -eq 0 ]; then
    echo "✅ Kontener $NAME został pomyślnie uruchomiony"
    echo "📋 Status kontenera:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep $NAME
else
    echo "❌ Błąd podczas uruchamiania kontenera $NAME"
    exit 1
fi