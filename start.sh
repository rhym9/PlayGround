#!/usr/bin/env bash
# Build the static game and serve it in the foreground on PORT (default 3000).
set -euo pipefail

time_cmd() {
  local label="$1"
  shift
  local started
  started="$(date +%s%N)"
  /usr/bin/time -p "$@"
  local finished
  finished="$(date +%s%N)"
  printf '[start] %s: %d ms\n' "$label" "$(( (finished - started) / 1000000 ))" >&2
}

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
FIXED_WEB_DIR="/home/runner/work/_temp/omgithub-web"
PORT="${PORT:-3000}"
export PORT
cd "$PROJECT_DIR"

time_cmd "create metadata dir" mkdir -p "$WEB_DIR" "$FIXED_WEB_DIR"

dep_hash="$(time_cmd "hash dependencies" sha256sum package.json package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [[ ! -d node_modules/three || ! -x node_modules/.bin/esbuild || ! -f "$WEB_DIR/dependency-hash" || "$(cat "$WEB_DIR/dependency-hash" 2>/dev/null)" != "$dep_hash" ]]; then
  if [[ -f package-lock.json ]]; then
    time_cmd "install dependencies" npm ci --no-audit --no-fund
  else
    time_cmd "install dependencies" npm install --no-audit --no-fund
  fi
  time_cmd "save dependency hash" bash -c 'printf "%s" "$1" > "$2"' _ "$dep_hash" "$WEB_DIR/dependency-hash"
else
  echo '[start] dependencies already installed' >&2
fi

source_hash="$(time_cmd "hash sources" find src scripts/build.mjs package.json -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
if [[ ! -f dist/index.html || ! -f dist/assets/game.js || ! -f "$WEB_DIR/build-hash" || "$(cat "$WEB_DIR/build-hash" 2>/dev/null)" != "$source_hash" ]]; then
  time_cmd "build static bundle" npm run build
  time_cmd "save build hash" bash -c 'printf "%s" "$1" > "$2"' _ "$source_hash" "$WEB_DIR/build-hash"
else
  echo '[start] build is up to date' >&2
fi

time_cmd "write deployment output" node -e '
  const fs = require("node:fs")
  const path = require("node:path")
  const project = process.argv[1]
  const directory = process.argv[2]
  const body = JSON.stringify({ project, directory })
  for (const target of process.argv.slice(3)) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
    console.log(`[start] deployment-output -> ${target}`)
  }
' "$PROJECT_DIR" "$PROJECT_DIR/dist" \
  "$WEB_DIR/deployment-output.json" \
  "$FIXED_WEB_DIR/deployment-output.json"

echo "[start] serving $PROJECT_DIR/dist on 0.0.0.0:$PORT" >&2
exec /usr/bin/time -p node "$PROJECT_DIR/scripts/serve.mjs" "$PROJECT_DIR/dist"
