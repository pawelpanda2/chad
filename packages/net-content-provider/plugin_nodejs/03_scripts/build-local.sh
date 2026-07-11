#!/bin/bash

# Build script for local development
# This script installs dependencies for the plugin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building plugin-nodejs..."
cd "$PROJECT_DIR"

# Install dependencies
npm install

echo "Build completed successfully!"