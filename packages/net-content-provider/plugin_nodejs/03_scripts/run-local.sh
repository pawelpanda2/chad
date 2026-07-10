#!/bin/bash

# Run script for local development
# This script starts the plugin server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting plugin-nodejs..."
cd "$PROJECT_DIR"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "Please edit .env file to set PLUGIN_ROOT path before running."
    exit 1
fi

# Start the server
npm start