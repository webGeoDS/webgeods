// Resolves the runtime dependency closure for one or more Pyodide
// packages against a pyodide-lock.json index — used by vendor-pyodide.sh.
//
// Unlike R's PACKAGES.rds (see resolve-r-deps.R), Pyodide's own `depends`
// field is already curated as the runtime-only list — no compile-time-only
// category to filter out here.
//
// Usage: node resolve-py-deps.mjs <pyodide-lock.json path> <pkg1,pkg2,...>
// Output: one "<package> <file_name>" line per package, sorted.

import { readFileSync } from "fs";

const [lockPath, rootsArg] = process.argv.slice(2);
const roots = rootsArg.split(",");

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const pkgs = lock.packages;

// PEP 503 normalization: "-", "_", "." are interchangeable in package
// names. `depends` entries and `pkgs` keys don't always agree on which
// one they use (e.g. pydantic's `depends` lists "pydantic_core", but
// the package key in pyodide-lock.json is "pydantic-core") — a naive
// case-insensitive compare silently drops the package with no warning,
// under-counting the closure. Caught by comparing this script's output
// against a real `micropip.install()` network capture, which did fetch
// pydantic_core.
const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");

function closure(roots) {
  const seen = new Set();
  const queue = [...roots];
  const byNormalizedName = new Map(
    Object.keys(pkgs).map((k) => [normalize(k), k])
  );
  while (queue.length) {
    const name = queue.shift();
    const key = byNormalizedName.get(normalize(name));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    for (const dep of pkgs[key].depends || []) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return [...seen].sort();
}

for (const name of closure(roots)) {
  console.log(name, pkgs[name].file_name);
}
