#!/usr/bin/env bash
# Dumps the current visible scrollback of each pane in the dashboard tmux
# session — useful when you don't want to attach interactively. For live
# following, just attach directly: tmux attach -t chad-dashboard
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

SESSION="chad-dashboard"

if ! command_exists tmux || ! tmux has-session -t "$SESSION" 2>/dev/null; then
  log_error "tmux session '$SESSION' is not running — nothing to show."
  log_error "  Start it first: bash 02_start.sh"
  exit 1
fi

for pane in $(tmux list-panes -t "$SESSION" -F '#{pane_index}'); do
  title="$(tmux display-message -p -t "$SESSION.$pane" '#{pane_title}')"
  echo ""
  echo "===== pane $pane: $title ====="
  tmux capture-pane -t "$SESSION.$pane" -p -S -200
done
