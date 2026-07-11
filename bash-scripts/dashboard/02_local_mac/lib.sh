#!/usr/bin/env bash
# Constants for local Mac dev without Docker (pnpm/tmuxinator). Non-secret —
# committed to git, unlike .env.local (which holds shared secrets/paths and
# lives at repo root). Source this, don't execute it directly.
#
# Matches the pattern already proven in
# packages/net-content-provider/03_scripts/qnap/lib.sh: hardcoded
# environment-specific constants in a sourced lib.sh, not a separate
# "config.sh" concept.

FRONTEND_PORT=12080
CONTENT_PROVIDER_API_URL="http://localhost:12024"
