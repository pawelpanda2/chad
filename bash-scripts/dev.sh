#!/usr/bin/env bash
# Local dev launcher — starts the multi-package tmuxinator session from the
# monorepo root. Mirrors the hiddengarden.events pattern (repo kolegi):
# tmuxinator is the local dev runtime, Docker Compose is only for local
# infrastructure (Mongo) here — NOT for the apps themselves.
#
# Path-independent by design: resolves the repo root from this script's own
# location (via git), not from the caller's $PWD — works regardless of which
# directory it's invoked from.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

# .tmuxinator.yml contains Polish (UTF-8) comments; tmuxinator (Ruby) fails
# with "invalid byte sequence in US-ASCII" if the shell locale isn't UTF-8.
# Force it here so this works regardless of the caller's environment.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$REPO_ROOT"
# NOTE: -p (not -c, which some older docs/comments reference) takes a path to
# the project config file, verified against the installed tmuxinator 3.4.1.
tmuxinator start -p .tmuxinator.yml
