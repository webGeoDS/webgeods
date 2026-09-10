#!/usr/bin/env bash
# Runs both convention checks (tool/article language split, shared/*.js
# size budgets) in sequence. Exits non-zero if either fails.
set -uo pipefail

fail=0

node check-tool-article-convention.mjs || fail=1
echo ""
node check-file-size-budget.mjs || fail=1

exit "$fail"
