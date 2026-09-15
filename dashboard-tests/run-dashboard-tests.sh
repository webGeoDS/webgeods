#!/usr/bin/env bash
# Lightweight wrapper around run-dashboard-tests.mjs: cleans up any
# leftover Chrome/Node processes from a previous interrupted run
# before starting (see ../cleanup-test-processes.sh) and again at the
# end, in case this run itself gets interrupted (timeout) before
# run-dashboard-tests.mjs reaches its own browser.close().
#
# Calling `node run-dashboard-tests.mjs` directly remains perfectly
# valid — this wrapper is just an extra bit of hygiene, same as
# map-tests/run-map-tests.sh.
#
# Usage: ./run-dashboard-tests.sh [--headed]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  "${SCRIPT_DIR}/../cleanup-test-processes.sh" >/dev/null 2>&1
}
trap cleanup EXIT

"${SCRIPT_DIR}/../cleanup-test-processes.sh"

node "${SCRIPT_DIR}/run-dashboard-tests.mjs" "$@"
exit $?
