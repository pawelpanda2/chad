#!/bin/bash

# ============================================
# Wykrywanie architektury systemu
# ============================================
# Ten skrypt wykrywa architekturę procesora i zwraca
# odpowiednią platformę Docker.
#
# Wyjście: linux/arm64 lub linux/amd64
# ============================================

# Wykryj architekturę procesora
ARCH=$(uname -m)

case "$ARCH" in
    arm64|aarch64)
        # Apple Silicon (M1/M2/M3) lub ARM64
        echo "linux/arm64"
        ;;
    x86_64|amd64)
        # Intel Mac lub x86_64 Linux
        echo "linux/amd64"
        ;;
    *)
        # Nieznana architektura - domyślnie amd64
        echo "linux/amd64"
        ;;
esac