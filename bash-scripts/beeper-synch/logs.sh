#!/bin/bash
# Tails the beeper-synch LaunchAgent's stdout/stderr logs.
set -euo pipefail
tail -f /tmp/chad-beeper-synch.log /tmp/chad-beeper-synch-error.log
