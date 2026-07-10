#!/bin/bash

# ============================================
# Pull obrazu cp_blazor z Docker Hub
# ============================================
# Użycie:
#   ./pull_assembly.sh           # pull z tagiem latest
#   ./pull_assembly.sh 260615_194030  # pull z konkretnym tagiem datowym
# ============================================

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Katalog główny repozytorium (content-provider/)
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Konfiguracja Docker Hub - zmień na swój login
DOCKERHUB_USER="${DOCKERHUB_USER:-pawelfluder}"

# Nazwa lokalnego obrazu
LOCAL_IMAGE_NAME="cp_blazor"

# Tag - pobierz z argumentu lub użyj latest
TAG="${1:-latest}"

# Pełne nazwy obrazów
LOCAL_IMAGE="${LOCAL_IMAGE_NAME}:${TAG}"
REMOTE_IMAGE="${DOCKERHUB_USER}/${LOCAL_IMAGE_NAME}:${TAG}"

# ============================================
# Informacje
# ============================================
echo "============================================"
echo "📥 Pull obrazu z Docker Hub"
echo "============================================"
echo "Project root:  $REPO_ROOT"
echo "Local image:   $LOCAL_IMAGE"
echo "Remote image:  $REMOTE_IMAGE"
echo "Tag:           $TAG"
echo "Action:        pull"
echo "============================================"

# Pull obrazu
echo "🚀 Pobieranie obrazu..."
docker pull "$REMOTE_IMAGE"

if [ $? -eq 0 ]; then
    echo "✅ Pull zakończony sukcesem!"
    
    # Tagowanie pobranego obrazu lokalną nazwą (bez usera)
    echo "🏷️  Tagowanie obrazu lokalną nazwą..."
    docker tag "$REMOTE_IMAGE" "$LOCAL_IMAGE"
    
    echo "   Obraz dostępny lokalnie jako: $LOCAL_IMAGE"
else
    echo "❌ Błąd podczas pobierania obrazu!"
    exit 1
fi