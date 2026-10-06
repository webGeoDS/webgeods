#!/usr/bin/env node
/**
 * Flags shared/*.js files that have grown past a reviewed size
 * budget -- not a hard architectural rule, just a tripwire so a file
 * accumulating unrelated concerns gets a deliberate look before it
 * grows further, instead of drifting unnoticed.
 *
 * Budgets are set close to each file's current size (some headroom
 * for normal growth, not so much that real drift goes unflagged). A
 * failure here isn't "revert your change" -- it's "this file just
 * crossed a size where splitting it becomes worth considering; bump
 * the budget below with a one-line reason if you've made that call."
 *
 * Files not listed use DEFAULT_BUDGET.
 *
 * Usage: node check-file-size-budget.mjs
 * Exit code: 0 if every file is within budget, 1 otherwise.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SHARED_DIR = "shared";
const DEFAULT_BUDGET = 1600; // above the largest file (map.js, ~1,480 lines) with some headroom

// Per-file overrides, each with a one-line reason.
const BUDGETS = {};

function lineCount(filePath) {
  const text = readFileSync(filePath, "utf8");
  return text.length === 0 ? 0 : text.split("\n").length;
}

let failed = false;

const files = readdirSync(SHARED_DIR).filter((f) => f.endsWith(".js"));

for (const file of files) {
  const filePath = path.join(SHARED_DIR, file);
  const lines = lineCount(filePath);
  const budget = BUDGETS[file] ?? DEFAULT_BUDGET;
  const pct = Math.round((lines / budget) * 100);

  if (lines > budget) {
    console.log(`  ✗ ${file}: ${lines} lines, over its ${budget}-line budget (${pct}%)`);
    failed = true;
  } else {
    console.log(`  ✓ ${file}: ${lines} lines (budget ${budget}, ${pct}%)`);
  }
}

console.log("");
if (failed) {
  console.log("FAILED: one or more shared/*.js files are over their size budget -- see above.");
  console.log("Not necessarily a problem to fix by shrinking the file -- see this script's own header comment.");
  process.exit(1);
}
console.log("All shared/*.js files are within budget.");
