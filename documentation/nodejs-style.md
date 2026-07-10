# Node.js Project Style Guide

## Overview

This document describes the conventions and standards for running and deploying the personal-manager Node.js project.

## Running the Project

The project should be run using the scripts in the `03_scripts/nodejs/` directory. These scripts are designed to work across different environments (local Mac, Docker, QNAP).

### Local Development on Mac

#### Building the Project

To build the entire project, run:

```bash
./03_scripts/nodejs/02_local_mac/build_all.sh
```

This script will:
1. Check for required `.env` files and create them from `.env.example` if missing
2. Install dependencies using pnpm
3. Build all packages in the workspace

#### Running in Development Mode

To run the project in development mode with hot-reload:

```bash
./03_scripts/nodejs/02_local_mac/run_dev.sh
```

This script will:
1. Start the API server in development mode
2. Start the frontend (dating-app) in development mode
3. Handle port conflicts automatically
4. Clean up processes on Ctrl+C

#### Running in Production Mode

To run the project in production mode (after building):

```bash
./03_scripts/nodejs/02_local_mac/run_prod.sh
```

This script will:
1. Verify the project has been built
2. Start the API server in production mode
3. Start the frontend in production mode

### Environment Variables

The scripts expect the following `.env` files:
- `.env` - Root environment file
- `artifacts/api-server/.env` - API server configuration
- `artifacts/dating-app/.env` - Frontend configuration

If these files don't exist, they will be created from `.env.example` files.

### Port Configuration

Default ports:
- Frontend: `12000`
- Backend (API): `12006`

These can be overridden via environment variables:
```bash
FRONTEND_PORT=3000 BACKEND_PORT=4000 ./03_scripts/nodejs/02_local_mac/run_dev.sh
```

## Script Path Resolution Standard

All scripts in `03_scripts/` must use the following standard pattern to find the workspace root directory. This ensures scripts work correctly regardless of where they are invoked from.

### Standard Path Resolution Pattern

```bash
#!/usr/bin/env bash

set -euo pipefail

# Find the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find the parent directory (nodejs/)
SCRIPTS_NODEJS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Find the scripts root directory (03_scripts/)
SCRIPTS_DIR="$(cd "${SCRIPTS_NODEJS_DIR}/.." && pwd)"

# Find the project root (personal-manager/)
PROJECT_ROOT_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"

# Define backend and frontend directories
BACKEND_DIR="${PROJECT_ROOT_DIR}/artifacts/api-server"
FRONTEND_DIR="${PROJECT_ROOT_DIR}/artifacts/dating-app"
```

### Explanation

1. **SCRIPT_DIR**: The absolute path to the directory containing the current script (e.g., `.../03_scripts/nodejs/02_local_mac`)
2. **SCRIPTS_NODEJS_DIR**: The parent directory (`03_scripts/nodejs`)
3. **SCRIPTS_DIR**: The scripts root directory (`03_scripts`)
4. **PROJECT_ROOT_DIR**: The full path to the project root (one level up from `03_scripts`)
5. **BACKEND_DIR**: Path to the API server (`artifacts/api-server`)
6. **FRONTEND_DIR**: Path to the frontend application (`artifacts/dating-app`)

### Project Structure

```
personal-manager/              <- PROJECT_ROOT_DIR
├── 03_scripts/                <- SCRIPTS_DIR
│   └── nodejs/                <- SCRIPTS_NODEJS_DIR
│       └── 02_local_mac/      <- SCRIPT_DIR (for local mac scripts)
├── artifacts/
│   ├── api-server/            <- BACKEND_DIR
│   └── dating-app/            <- FRONTEND_DIR
```

## Package Manager

This project uses **pnpm** as the package manager. All scripts should use `pnpm` commands instead of `yarn` or `npm`.

### Checking for pnpm

```bash
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[ERROR] pnpm is not installed."
  echo "Install it with: npm install -g pnpm"
  exit 1
fi
```

## Project Structure

```
personal-manager/
├── 03_scripts/           # Deployment and run scripts
│   └── nodejs/
│       ├── 01_envs_from_repo/
│       ├── 02_local_mac/
│       ├── 03_docker_common/
│       ├── 04_docker_mac/
│       ├── 05_docker_qnap_test/
│       ├── 06_docker_qnap_prod/
│       └── 07_ssh_qnap/
├── artifacts/            # Main applications
│   ├── api-server/       # Backend API
│   ├── dating-app/       # Frontend application
│   └── mockup-sandbox/   # Mockup preview
├── lib/                  # Shared libraries
│   ├── api-client-react/
│   ├── api-spec/
│   ├── api-zod/
│   └── db/
├── scripts/              # Utility scripts
└── architecture/         # Documentation
```

## Docker Deployment

For Docker deployment, use the scripts in:
- `04_docker_mac/` - For local Mac Docker deployment
- `05_docker_qnap_test/` - For QNAP test environment
- `06_docker_qnap_prod/` - For QNAP production environment

## SSH Deployment to QNAP

For deploying to QNAP via SSH, use the scripts in:
- `07_ssh_qnap/`