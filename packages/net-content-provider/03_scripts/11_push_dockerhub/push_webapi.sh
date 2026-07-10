#!/bin/bash

# ============================================
# Push obrazu cp_webapi na Docker Hub
# ============================================
# Użycie:
#   ./push_webapi.sh                    # auto: wybiera najnowszy tag datowy
#   ./push_webapi.sh 260615_194030      # push konkretnego lokalnego taga
#   ./push_webapi.sh latest             # push z tagiem latest
# ============================================

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Katalog główny repozytorium (content-provider/)
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Konfiguracja Docker Hub - zmień na swój login
DOCKERHUB_USER="${DOCKERHUB_USER:-pawelfluder}"

# Nazwa lokalnego obrazu
LOCAL_IMAGE_NAME="cp_webapi"

# ============================================
# Wybór taga
# ============================================
TAG="${1:-}"

if [ -z "$TAG" ]; then
    # Auto: znajdź najnowszy tag datowy
    TAG=$(docker images "$LOCAL_IMAGE_NAME" --format "{{.Tag}}" \
        | grep -E '^[0-9]{6}_[0-9]{6}$' \
        | sort \
        | tail -n 1)

    if [ -z "$TAG" ]; then
        echo "❌ Nie znaleziono lokalnego taga datowego dla $LOCAL_IMAGE_NAME."
        echo ""
        echo "   Dostępne obrazy:"
        docker images "$LOCAL_IMAGE_NAME"
        exit 1
    fi

    TAG_SOURCE="auto-selected"
    echo "ℹ️  Nie podano taga - auto-selected najnowszy: $TAG"
else
    TAG_SOURCE="manual"
    echo "ℹ️  Używam podanego taga: $TAG"
fi

# Pełne nazwy obrazów
SOURCE_IMAGE="${LOCAL_IMAGE_NAME}:${TAG}"
REMOTE_IMAGE="${DOCKERHUB_USER}/${LOCAL_IMAGE_NAME}:${TAG}"

# ============================================
# Informacje
# ============================================
echo "============================================"
echo "📦 Push obrazu na Docker Hub"
echo "============================================"
echo "Project root:  $REPO_ROOT"
echo "Source image:  $SOURCE_IMAGE"
echo "Remote image:  $REMOTE_IMAGE"
echo "Tag:           $TAG ($TAG_SOURCE)"
echo "Action:        push"
echo "============================================"

# Sprawdź czy źródłowy obraz istnieje
if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${SOURCE_IMAGE}$"; then
    echo "❌ Błąd: Obraz źródłowy '$SOURCE_IMAGE' nie istnieje!"
    echo ""
    echo "   Dostępne lokalne obrazy:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}" | grep "^${LOCAL_IMAGE_NAME}"
    exit 1
fi

# Logowanie do Docker Hub
echo "🔐 Logowanie do Docker Hub..."
docker login

# Tagowanie i push
echo "🏷️  Tagowanie obrazu..."
docker tag "$SOURCE_IMAGE" "$REMOTE_IMAGE"

echo "🚀 Pushowanie obrazu..."
docker push "$REMOTE_IMAGE"

if [ $? -eq 0 ]; then
    echo "✅ Push zakończony sukcesem!"
    echo "   Obraz dostępny jako: $REMOTE_IMAGE"
else
    echo "❌ Błąd podczas pushowania obrazu!"
    exit 1
fi