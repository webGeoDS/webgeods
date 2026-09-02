#!/usr/bin/env bash
# Render → serve (static) → smoke test → teardown, in a single command.
#
# Usage:
#   ./run-smoke-test.sh [project_dir] [page.html]
#
# Default: project_dir=lessons, page=test-architettura.html
#
# What it does, in order:
#   1. Syncs shared/ into blog/ and lessons/ (sync-shared-assets.sh)
#   2. Renders the page with `quarto render` (once, not a server that
#      re-renders on every request — see below)
#   3. Serves the already-rendered HTML with a minimal Node static
#      server (static-server.mjs)
#   4. Runs smoke-test.mjs (Playwright) against the served HTML
#   5. Shuts down the server, even if the smoke test fails
#
# Why not `quarto preview`: for pages with `embed-resources: true` and
# several vendored assets (fonts, maplibre-gl.js, codemirror-bundle.js),
# its dev server re-renders from scratch (re-inlining everything as
# base64) on EVERY request, with no cache — 15-40s even on a "warm"
# server, occasionally over 90s under load. It's not a network issue
# (no external connections observed while waiting, via netstat): it's
# CPU/IO work needlessly repeated. `quarto render` does the same work
# only once (a few seconds), then the static file is served in
# milliseconds.
#
# The exit code is that of smoke-test.mjs (0 = all checks passed),
# not that of the orchestration script itself.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-lessons}"
PAGE="${2:-test-architettura.html}"
QMD="${PAGE%.html}.qmd"
PORT="${PORT:-4444}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-90000}" # ms, per-check, passed to smoke-test.mjs

URL="http://127.0.0.1:${PORT}/${PAGE}"

SERVER_PID=""
cleanup() {
  if [ -n "${SERVER_PID}" ]; then
    kill "${SERVER_PID}" >/dev/null 2>&1
    taskkill //PID "${SERVER_PID}" //F >/dev/null 2>&1
  fi
  # In case smoke-test.mjs itself was interrupted (timeout) before its
  # own browser.close() — see cleanup-test-processes.sh.
  "${SCRIPT_DIR}/cleanup-test-processes.sh" >/dev/null 2>&1
}
trap cleanup EXIT

# ------------------------------------------------------------------
# 0. Preventive cleanup of any leftover processes from a previous
#    interrupted run (see cleanup-test-processes.sh)
# ------------------------------------------------------------------
"${SCRIPT_DIR}/cleanup-test-processes.sh"

# ------------------------------------------------------------------
# 1. Sync shared assets
# ------------------------------------------------------------------
echo "==> Sync shared/ -> blog/ and lessons/"
"${SCRIPT_DIR}/sync-shared-assets.sh"

# ------------------------------------------------------------------
# 2. Render (once only, via CLI — not a dev server)
# ------------------------------------------------------------------
echo "==> Rendering ${PROJECT_DIR}/${QMD}"
if ! ( cd "${SCRIPT_DIR}/${PROJECT_DIR}" && quarto render "${QMD}" ); then
  echo "ERROR: 'quarto render ${QMD}' failed."
  exit 1
fi

# ------------------------------------------------------------------
# 3. Serve the static output
# ------------------------------------------------------------------
echo "==> Starting the static server on ${PROJECT_DIR}/ (port ${PORT})"
node "${SCRIPT_DIR}/static-server.mjs" "${SCRIPT_DIR}/${PROJECT_DIR}" "${PORT}" > /tmp/static-server.log 2>&1 &
SERVER_PID=$!

wait_timeout=15
waited=0
while ! grep -q "LISTENING" /tmp/static-server.log 2>/dev/null; do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "ERROR: the static server closed immediately. Log:"
    cat /tmp/static-server.log 2>/dev/null
    exit 1
  fi
  sleep 0.5
  waited=$((waited + 1))
  if [ "${waited}" -ge $((wait_timeout * 2)) ]; then
    echo "ERROR: the static server is not ready after ${wait_timeout}s."
    exit 1
  fi
done
echo "==> Server ready. Requesting ${URL}..."

http_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${URL}")"
if [ "${http_code}" != "200" ]; then
  echo "ERROR: HTTP response ${http_code} from ${URL}."
  exit 1
fi
echo "==> Page ready (HTTP 200)."

# ------------------------------------------------------------------
# 4. Playwright smoke test
# ------------------------------------------------------------------
echo "==> Running smoke-test.mjs"
node "${SCRIPT_DIR}/smoke-test.mjs" "${URL}" --timeout="${SMOKE_TIMEOUT}"
smoke_exit=$?

exit "${smoke_exit}"
