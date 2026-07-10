#!/usr/bin/env bash
# Starts the chad dashboard for local dev, plus everything it actually needs
# — nothing more. Intentionally does NOT start: contacts, beeper-sync,
# beeper-ws, beeper-oplog, or MongoDB — none of those are dependencies of the
# current dashboard code (verified 2026-07-10: no MongoDB import anywhere in
# packages/dashboard). Content Provider API IS started if it isn't already
# running (see run-content-provider-if-needed.sh) — dashboard genuinely needs
# it for several views.
#
# Usage:
#   ./bash-scripts/dashboard/begin.sh            # normal start
#   ./bash-scripts/dashboard/begin.sh --install  # also run pnpm install first
#
# Works from any cwd — resolves the repo root from this script's own
# location via git, not from $PWD.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"

DO_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL=true ;;
    *) log_warn "Unknown argument: $arg (ignored)" ;;
  esac
done

cd "$REPO_ROOT"

echo ""
log_info "chad dashboard — local start"
echo ""

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

FAIL=false

require_command pnpm "brew install pnpm  (or: corepack enable)" || FAIL=true
require_command tmux "brew install tmux" || FAIL=true
require_command tmuxinator "brew install tmuxinator  (needs Ruby; brew handles that)" || FAIL=true

require_file "$REPO_ROOT/packages/dashboard/.env" \
  "cp packages/dashboard/.env.example packages/dashboard/.env and fill in real values" || FAIL=true

for pkg in dba console dashboard; do
  require_file "$REPO_ROOT/packages/$pkg/package.json" \
    "packages/$pkg is missing — this repo's monorepo skeleton is incomplete" || FAIL=true
done

if [ "$FAIL" = true ]; then
  log_error "Preflight checks failed — fix the issues above and re-run."
  exit 1
fi

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  if [ "$DO_INSTALL" = true ]; then
    log_info "node_modules missing — running pnpm install (--install was passed)..."
    pnpm install
  else
    log_error "node_modules is missing at repo root."
    log_error "  Fix: ./bash-scripts/dashboard/begin.sh --install"
    log_error "  or:  pnpm install   (from $REPO_ROOT)"
    exit 1
  fi
fi

# Determine the dashboard's dev port from its own .env (FRONTEND_PORT),
# falling back to Next.js's own default. This is the single source of truth
# used by begin/status/end/logs so they all agree on which port to check.
FRONTEND_PORT="$(grep -E '^FRONTEND_PORT=' "$REPO_ROOT/packages/dashboard/.env" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
export PORT="$FRONTEND_PORT"

if port_in_use "$FRONTEND_PORT"; then
  log_error "Port $FRONTEND_PORT is already in use."
  log_error "  Fix:"
  log_error "    bash status.sh"
  log_error "    bash end.sh"
  exit 1
fi

if tmux has-session -t chad-dashboard 2>/dev/null; then
  log_error "tmux session 'chad-dashboard' is already running."
  log_error "  Fix:"
  log_error "    bash status.sh"
  log_error "    bash end.sh"
  exit 1
fi

log_ok "Preflight checks passed (pnpm, tmux, tmuxinator, env, packages present, port $FRONTEND_PORT free)."

# ---------------------------------------------------------------------------
# Ensure dba is built at least once before Next.js tries to import it
# (tmuxinator starts the dba-watch pane and the dashboard-dev pane at close
# to the same time — without this, dashboard can start before dist/ exists).
# ---------------------------------------------------------------------------

if [ ! -f "$REPO_ROOT/packages/dba/dist/index.js" ]; then
  log_info "packages/dba has no build output yet — building once before starting dev watch..."
  pnpm --filter dba build
  log_ok "dba built."
fi

# ---------------------------------------------------------------------------
# Content Provider API — check, start it if not reachable (using the real
# existing content-provider script, not a guessed one), and WAIT for it to
# become healthy before this begin.sh considers itself done. This is a
# blocking, synchronous step run BEFORE the interactive tmuxinator session
# starts, because once tmuxinator attaches interactively control does not
# return to this script until the user detaches — there is no point after
# that where "wait, then declare done" could still happen.
#
# The same script also runs again inside the tmuxinator "content-provider"
# pane (see tmuxinator.dashboard.yml) — safe to call twice: it checks health
# first and only starts something if it's actually down, so this is not a
# duplicate start, just a second (now-trivially-passing) health check that
# also gives the pane something live to show (log tailing).
# ---------------------------------------------------------------------------

log_info "Checking / ensuring Content Provider API..."
if ! bash "$REPO_ROOT/bash-scripts/dashboard/run-content-provider-if-needed.sh" --wait-only; then
  log_warn "Content Provider API is not available."
  log_warn "  Dashboard views that depend on it (leads, statuses, msg-planner, ...) will error."
  log_warn "  Views that don't touch it will still work fine."
fi

# ---------------------------------------------------------------------------
# Launch the dashboard-scoped tmuxinator session
# ---------------------------------------------------------------------------

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

log_info "Starting tmuxinator session 'chad-dashboard' (dba watch + dashboard dev + content-provider)..."
echo ""

if [ -t 1 ]; then
  # Real interactive terminal — attach normally, the whole point of using
  # tmuxinator, so the user lands inside the session.
  tmuxinator start -p "$REPO_ROOT/bash-scripts/dashboard/tmuxinator.dashboard.yml"
else
  # No controlling terminal (e.g. invoked from CI, another script, or an
  # agent) — tmux cannot attach here ("open terminal failed: not a
  # terminal"). Start detached instead and tell the caller how to attach.
  tmuxinator start -p "$REPO_ROOT/bash-scripts/dashboard/tmuxinator.dashboard.yml" --no-attach
  log_ok "Session started in the background (no TTY available to attach here)."
  log_info "Attach with: tmux attach -t chad-dashboard"
fi
