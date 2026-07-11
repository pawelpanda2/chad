#!/usr/bin/env bash
# end.sh + begin.sh. Passes through any args (e.g. --install) to begin.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/end.sh"
"$SCRIPT_DIR/begin.sh" "$@"
