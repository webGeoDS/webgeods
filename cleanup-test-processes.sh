#!/usr/bin/env bash
# Kills "zombie" Chrome/Node processes left behind by a previous
# Playwright run that was interrupted (timeout, script terminated
# before browser.close(), bash session closed mid-way) — not a
# blanket `taskkill`: it only targets headless instances launched by
# Playwright and Node processes running THIS project's test scripts,
# identified by filtering on each process's command line. It does not
# touch chrome.exe/node.exe used for anything else (the user's
# browser, an unrelated dev server, VS Code, etc.).
#
# Why this is needed: running several heavy Playwright checks in a row
# (Pyodide + webR + MapLibre together, as in the end-to-end tests of
# blog/posts/topology-fix.qmd) quickly saturates CPU/RAM if a previous
# run left processes hanging — observed symptom: growing timeouts on
# identical subsequent runs, resolved by killing the leftover
# processes before starting again.
#
# Usage:
#   ./cleanup-test-processes.sh
#
# Run this BEFORE a series of heavy checks (to start from a clean
# state) and/or after, if a script was interrupted manually. Already
# called automatically by run-smoke-test.sh and by
# map-tests/run-map-tests.sh.
#
# Implementation: the PowerShell script that does the actual work
# lives in a separate .ps1 file (instead of inline in a -Command
# string) to avoid the three-level bash/PowerShell/WQL quoting that
# makes inline scripts fragile and hard to re-read.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "${SCRIPT_DIR}/cleanup-test-processes.ps1" 2>/dev/null || echo "${SCRIPT_DIR}/cleanup-test-processes.ps1")"
