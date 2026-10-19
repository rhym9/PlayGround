#!/usr/bin/env bash
# Capture desktop and mobile screenshots of a running preview.
# Exit 75 for temporary browser/navigation infrastructure failures, 1 for defects.
set -euo pipefail

time_cmd() {
  local label="$1"
  shift
  local started
  started="$(date +%s%N)"
  /usr/bin/time -p "$@"
  local finished
  finished="$(date +%s%N)"
  printf '[capture] %s: %d ms\n' "$label" "$(( (finished - started) / 1000000 ))" >&2
}

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the source tree.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
time_cmd "create capture directory" mkdir -p "$CAPTURE_DIR"
time_cmd "capture desktop and mobile views" node "$SCRIPT_DIR/scripts/capture.mjs"

printf '[capture] desktop -> %s\n' "$CAPTURE_DIR/final-desktop.png" >&2
printf '[capture] mobile  -> %s\n' "$CAPTURE_DIR/final-mobile.png" >&2
