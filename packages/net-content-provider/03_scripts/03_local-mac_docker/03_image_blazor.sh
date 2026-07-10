#!/bin/bash

# ============================================
# Build obrazu cp_blazor z informacjami o Git
# ============================================
# UWAGA: Architektura jest wykrywana automatycznie
# na podstawie procesora (Apple Silicon = arm64, Intel = amd64)
# ============================================

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "SCRIPT_DIR: $SCRIPT_DIR"

# Katalog główny repozytorium (czyli content-provider/)
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
echo "REPO_ROOT: $REPO_ROOT"

# Ścieżka do folderu z Dockerfile
DOCKERFILE_DIR="$REPO_ROOT/04_dockerfiles"
echo "DOCKERFILE_DIR: $DOCKERFILE_DIR"

# ============================================
# Wykrywanie architektury
# ============================================
COMMON_SCRIPTS_DIR="$SCRIPT_DIR/../00_common"
if [ -f "$COMMON_SCRIPTS_DIR/detect_arch.sh" ]; then
    DETECTED_PLATFORM=$("$COMMON_SCRIPTS_DIR/detect_arch.sh")
else
    # Fallback: wykryj ręcznie
    ARCH=$(uname -m)
    case "$ARCH" in
        arm64|aarch64) DETECTED_PLATFORM="linux/arm64" ;;
        *) DETECTED_PLATFORM="linux/amd64" ;;
    esac
fi
echo "🔍 Wykryta architektura: $DETECTED_PLATFORM"

# ============================================
# Informacje o Git i buildzie
# ============================================
GIT_COMMIT=$(git rev-parse HEAD)
GIT_COMMIT_SHORT=$(git rev-parse --short HEAD)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_REMOTE_URL=$(git config --get remote.origin.url || echo "unknown")

# Nazwa obrazu i tag
IMAGE_NAME="cp_blazor"
TAG=$(date +"%y%m%d_%H%M%S")
FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"

echo "============================================"
echo "🔨 Build obrazu Docker"
echo "============================================"
echo "Image name:    $FULL_IMAGE_NAME"
echo "Tag:           $TAG"
echo "Git commit:    $GIT_COMMIT"
echo "Git short:     $GIT_COMMIT_SHORT"
echo "Build date:    $BUILD_DATE"
echo "Remote URL:    $GIT_REMOTE_URL"
echo "============================================"

# Budowanie obrazu dla wykrytej architektury
echo "🚀 docker buildx build --platform $DETECTED_PLATFORM -f $DOCKERFILE_DIR/assembly -t $FULL_IMAGE_NAME --build-arg GIT_COMMIT=$GIT_COMMIT --build-arg GIT_COMMIT_SHORT=$GIT_COMMIT_SHORT --build-arg BUILD_DATE=$BUILD_DATE --build-arg GIT_REMOTE_URL=$GIT_REMOTE_URL --load $REPO_ROOT"

docker buildx build \
  --platform "$DETECTED_PLATFORM" \
  -f "$DOCKERFILE_DIR/assembly" \
  -t "$FULL_IMAGE_NAME" \
  --build-arg GIT_COMMIT="$GIT_COMMIT" \
  --build-arg GIT_COMMIT_SHORT="$GIT_COMMIT_SHORT" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  --build-arg GIT_REMOTE_URL="$GIT_REMOTE_URL" \
  --load \
  "$REPO_ROOT"

if [ $? -eq 0 ]; then
    echo "✅ Build zakończony sukcesem!"
    echo "   Obraz: $FULL_IMAGE_NAME"
else
    echo "❌ Błąd podczas buildu!"
    exit 1
fi