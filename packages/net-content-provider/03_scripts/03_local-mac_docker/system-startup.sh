#!/bin/bash

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_BOTH_SCRIPT="$SCRIPT_DIR/run_both.sh"
DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"

echo "Uruchamiam Docker.app..."
open -a Docker

# Docker Desktop otwiera się z widocznym oknem/dockiem - chowamy je jak
# najszybciej się da. Proces bywa jeszcze niewidoczny dla System Events
# tuż po `open`, więc próbujemy kilka razy zamiast jednorazowego sleep 3.
echo "Chowam okno Docker Desktop..."
for i in {1..20}; do
  if osascript -e 'tell application "System Events" to set visible of process "Docker Desktop" to false' 2>/dev/null; then
    echo "Docker Desktop schowany"
    break
  fi
  sleep 0.5
done

echo "Docker bin: $DOCKER_BIN"
echo "Czekam aż Docker zacznie działać..."

for i in {1..60}; do
  if "$DOCKER_BIN" info >/dev/null 2>&1; then
    echo "Docker działa"
    break
  fi

  echo "Docker jeszcze nie działa... próba $i/60"
  sleep 3
done

if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
  echo "BŁĄD: Docker nie wystartował"
  exit 1
fi

echo "Uruchamiam API i Blazor..."
bash "$RUN_BOTH_SCRIPT"

echo "Gotowe"
