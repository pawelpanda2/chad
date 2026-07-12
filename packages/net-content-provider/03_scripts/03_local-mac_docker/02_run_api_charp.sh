#!/bin/bash

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "SCRIPT_DIR: $SCRIPT_DIR"

# Katalog główny repozytorium
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
echo "REPO_ROOT: $REPO_ROOT"

# Stałe dla lokalnego środowiska docker na Macu.
# Brak pliku .env celowo — appsettings.json (SharpContainerApi/appsettings.json,
# baked do obrazu) już poprawnie wskazuje PreparerModule:NoSqlRepoSearchPaths =
# /Users/pawelfluder/Dropbox (aplikacja sama doszukuje się podfolderu "repos"
# pod tą ścieżką — patrz Helpers/GuidGroupsHelper.cs). Nie ma tu żadnego
# /data/repos ani /Volumes/cp_1 — ten stary mount + AppSettingsName= był
# martwym kodem (appsettings.Production.Macbook.json nigdy nie trafia do
# obrazu poza katalogiem backup/, więc AppSettingsName nic nie robi; sam kod
# .cs nigdzie tej zmiennej nie czyta) i tylko wywalał `docker run`, gdy dysk
# cp_1 nie był podpięty. Port 12004 (nie 12024) żeby nie kolidować z nowym
# stackiem bash-scripts/dashboard/03_local_mac_docker.
CONTENT_PROVIDER_API_PORT=12004
CONTENT_PROVIDER_API_IMAGE_PREFIX=cp_webapi
CONTENT_PROVIDER_API_CONTAINER_NAME=cp_api_csharp

NAME="$CONTENT_PROVIDER_API_CONTAINER_NAME"

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
IMAGE=$(find_latest_image "$CONTENT_PROVIDER_API_IMAGE_PREFIX")

if [ -z "$IMAGE" ]; then
    echo "❌ Błąd: Nie znaleziono żadnego obrazu Docker z prefixem '$CONTENT_PROVIDER_API_IMAGE_PREFIX'"
    echo "   Uruchom najpierw skrypt buildowania obrazu:"
    echo "   $SCRIPT_DIR/01_image_webapi.sh"
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
echo "   Port: $CONTENT_PROVIDER_API_PORT:$CONTENT_PROVIDER_API_PORT"
echo "   Dropbox: /Users/pawelfluder/Dropbox -> /Users/pawelfluder/Dropbox"
docker run -d --rm \
  --name $NAME \
  -p $CONTENT_PROVIDER_API_PORT:$CONTENT_PROVIDER_API_PORT \
  -e ASPNETCORE_URLS="http://+:$CONTENT_PROVIDER_API_PORT" \
  -e ApiUrls="http://0.0.0.0:$CONTENT_PROVIDER_API_PORT" \
  -v "/Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox" \
  $IMAGE