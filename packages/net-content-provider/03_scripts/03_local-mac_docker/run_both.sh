#!/bin/bash

# ============================================
# Uruchamia oba lokalne kontenery docker: API (C#) i Blazor
# Wymaga, żeby obrazy były wcześniej zbudowane
# (01_image_api_charp.sh i 03_image_blazor.sh)
# ============================================

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "🔧 Uruchamiam API (C#)"
echo "============================================"
bash "$SCRIPT_DIR/02_run_api_charp.sh"
API_STATUS=$?

echo ""
echo "============================================"
echo "🌐 Uruchamiam Blazor"
echo "============================================"
bash "$SCRIPT_DIR/04_run_blazor.sh"
BLAZOR_STATUS=$?

echo ""
echo "============================================"
if [ $API_STATUS -eq 0 ] && [ $BLAZOR_STATUS -eq 0 ]; then
    echo "✅ Oba kontenery uruchomione"
else
    echo "❌ Coś poszło nie tak (API: $API_STATUS, Blazor: $BLAZOR_STATUS)"
    exit 1
fi
