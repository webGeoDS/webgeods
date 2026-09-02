# Resolves the runtime dependency closure for one or more R packages
# against a webR PACKAGES.rds index — used by vendor-webr.sh.
#
# Only Depends + Imports count: LinkingTo is deliberately excluded.
# LinkingTo lists compile-time-only C++ header dependencies (Rcpp-style)
# that are already baked into the precompiled .tgz binary webR ships —
# not needed at runtime. Confirmed against a real webR run: including
# LinkingTo over-counts (e.g. it would pull in geometries/jsonify/
# rapidjsonr/sfheaders for geojsonsf, none of which a real browser ever
# fetches).
#
# Usage: Rscript resolve-r-deps.R <PACKAGES.rds path> <pkg1,pkg2,...>
# Output: one "<package> <file_name>" line per line, sorted by package.

args <- commandArgs(trailingOnly = TRUE)
lock_path <- args[1]
roots <- strsplit(args[2], ",")[[1]]

pkgs <- readRDS(lock_path)
df <- as.data.frame(pkgs, stringsAsFactors = FALSE)
rownames(df) <- df$Package

base_pkgs <- c("R", "methods", "utils", "stats", "graphics", "grDevices",
               "grid", "tools", "parallel", "compiler", "datasets",
               "splines", "stats4", "tcltk",
               # "webr": webR's own JS-interop shim (eval_js()), baked into
               # every R.wasm image at build time — never installed via
               # install.packages(). The webR-patched httpuv Imports it by
               # this name, but its DESCRIPTION also carries
               # `Remotes: webr=github::r-wasm/webr/packages/webr`, i.e. it
               # is NOT the unrelated CRAN package of the same name (a
               # student-assessment toolkit that pulls in moonBook/car/
               # lme4/forecast/etc.). Confirmed via network capture: real
               # webR installs never fetch a webr_*.tgz, and 'webr' is
               # already in installed.packages() on a fresh instance with
               # nothing installed. Resolving it against the general repo
               # listing (as this script did before) matches the wrong,
               # CRAN-mirrored package and over-counts by ~85 packages.
               "webr")

parse_deps <- function(field) {
  if (is.na(field) || field == "") return(character(0))
  parts <- strsplit(field, ",")[[1]]
  parts <- trimws(gsub("\\(.*\\)", "", parts))
  parts <- parts[parts != ""]
  setdiff(parts, base_pkgs)
}

closure <- function(roots) {
  seen <- character(0)
  queue <- roots
  while (length(queue) > 0) {
    p <- queue[1]
    queue <- queue[-1]
    if (p %in% seen) next
    if (!p %in% rownames(df)) {
      warning("package not found in lock file: ", p)
      next
    }
    seen <- c(seen, p)
    row <- df[p, ]
    deps <- unique(c(parse_deps(row$Depends), parse_deps(row$Imports)))
    queue <- c(queue, setdiff(deps, seen))
  }
  seen
}

result <- sort(closure(roots))
for (p in result) {
  # Not every PACKAGES.rds carries a "File" column (contrib/4.6's did;
  # contrib/4.4's doesn't) — fall back to the standard repo filename
  # convention, verified against real download URLs when absent.
  file_name <- if ("File" %in% colnames(df) && !is.na(df[p, "File"])) {
    df[p, "File"]
  } else {
    paste0(p, "_", df[p, "Version"], ".tgz")
  }
  cat(p, file_name, "\n")
}
