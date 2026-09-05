#!/usr/bin/env node
// post-render-fixups.mjs
//
// Small, independent post-render patches for things Quarto's own
// output gets wrong or leaves undone, run AFTER `quarto render blog`.
// Two fixes today:
//
//   1. Search index text leaking hidden code/comments (see
//      fixSearchIndex()'s own comment for the full story).
//   2. The navbar logo's empty alt="" -- `logo-alt:` IS a real,
//      documented navbar option (checked the installed schema
//      directly), but setting it in _quarto.yml had no effect on the
//      rendered HTML in this Quarto version (1.7.29) -- verified
//      empirically (rendered, grepped for the new alt text, found
//      alt="" unchanged) before writing a workaround, not assumed
//      broken. Same class of version gap already hit once before in
//      this project (_brand.yml's `typography.fonts.source: file`,
//      see fonts.css's own comment) -- patched here instead of
//      re-litigated.
//
// Quarto's own search-index builder works off each .qmd's raw
// markdown source (confirmed by inspecting .quarto/idx/*.qmd.json:
// its "markdown" field contains the fenced code blocks verbatim,
// comments included), not the rendered HTML -- so `//| echo: false`
// on an {ojs}/{.webgeods-python}/{.webgeods-r} cell hides it from the
// page a reader sees, but does nothing for search: internal
// implementation comments and variable names end up in search.json
// as if they were page content (confirmed empirically: e.g. a search
// on "topology" surfacing raw source like "topology-checker.qmd's
// sliders -- referencing this OJS variable ... targetCrsControl").
// See roadmap-acquisizione.md's SEO/navigability audit, 2026-09-06.
//
// No Quarto config exists for this (no per-cell search-exclude
// option; `search: false` in front matter excludes the WHOLE page).
// This script re-derives each section's indexed text directly from
// the .qmd source instead, stripping ONLY braced executable-cell
// fences (```{ojs}, ```{.webgeods-python ...}, ```{.webgeods-r ...})
// -- deliberately NOT plain ```python/```r fences, which are
// legitimate reader-facing illustrative code (e.g. the "Same spatial
// question, two languages" sections) and worth keeping searchable.
//
// Run AFTER `quarto render blog` (reads and overwrites
// blog/_site/search.json), matching every other post-render fixup
// this project already has as its own script rather than fighting
// Quarto's internals in place.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SITE_DIR = "blog/_site";
const SRC_DIR = "blog";
const SEARCH_JSON = path.join(SITE_DIR, "search.json");

function stripExecutableCells(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && /^```\{/.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim() === "```") {
        skipping = false;
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

// Mirrors Quarto's own heading-anchor slugification closely enough
// for this project's headings (ASCII text, no special GFM edge
// cases): lowercase, strip non-alphanumerics (keep spaces/hyphens),
// collapse spaces to hyphens.
function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  // Pandoc's auto-identifier extension drops a leading ordinal
  // entirely for headings like "3. Shared map and summary" -- the
  // real id is "shared-map-and-summary", not "3-shared-map-and-
  // summary" (confirmed against this project's own rendered output:
  // topology-errors.qmd/geospatial-file-inspection.qmd both number
  // their H2s). Missing this made every numbered-heading section fail
  // to match its own entry and fall back to Quarto's un-fixed,
  // code-leaking text -- caught by re-scanning the whole fixed index
  // for leftover source signatures instead of trusting the first,
  // partial spot-check.
  return slug.replace(/^[\d-]+/, "");
}

// Splits a code-stripped .qmd body into { slug -> plain prose text }
// sections, chunked at H2 (##) boundaries -- matching the chunking
// already visible in Quarto's own generated search.json. "" holds
// the intro (everything before the first H2).
function extractSections(markdown) {
  // Explicit {#custom-id} headings (e.g. "## Latest articles {#latest-articles}")
  // override the slugified text -- same override Quarto itself honors.
  const headingRe = /^##\s+(.+?)(?:\s*\{#([\w-]+)\})?\s*$/;
  const sections = {};
  let currentSlug = "";
  let currentTitle = "";
  let buffer = [];

  const flush = () => {
    const text = buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) {
      sections[currentSlug] = (currentTitle ? currentTitle + "\n" : "") + text;
    }
    buffer = [];
  };

  for (const line of markdown.split("\n")) {
    const m = line.match(headingRe);
    if (m) {
      flush();
      currentTitle = m[1].trim();
      currentSlug = m[2] || slugify(currentTitle);
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections;
}

// Strips markdown syntax down to plain-ish text -- not a full
// markdown parser, just enough to match the shape of Quarto's own
// plain-text extraction closely. Inline code spans (`is_valid`,
// `make_valid()`) are protected BEFORE the bold/italic strip runs and
// restored after: the naive regex for italics (`_x_`) would otherwise
// treat the underscore in a bare identifier like `is_valid` as
// emphasis syntax and mangle it to "isvalid" -- a real bug caught by
// diffing this script's own output against a snake_case identifier,
// exactly the kind of technical term someone would search for.
function toPlainish(text) {
  // Triple-backtick fences (the plain ```python/```r illustrative
  // blocks this function is reached for at all -- braced ```{...}
  // executable cells are already gone by stripExecutableCells())
  // handled FIRST and separately from single-backtick inline code:
  // otherwise the inline-code regex below (built for single
  // backticks) misparses a fence's triple backticks and mangles the
  // block into stray backtick fragments -- a real bug caught by
  // reading this script's own output, not assumed away.
  const defenced = text.replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code) => "\n" + code.trim() + "\n");

  // Markdown footnotes (Tufte-style margin notes, added 2026-09-06):
  // the definition marker "[^id]: " stripped first, keeping the note
  // text itself as ordinary searchable prose; the bare "[^id]"
  // reference point stripped second, with nothing to keep. Order
  // matters -- the second pattern alone would also match (and mangle)
  // the first. A real leak, not a hypothetical: caught by re-checking
  // the fixed index for the literal "[^" this introduced, the same
  // "verify the whole index, not just one spot check" habit that
  // already caught the numbered-heading bug once.
  const defootnoted = defenced
    .replace(/\[\^[\w-]+\]:\s*/g, "")
    .replace(/\[\^[\w-]+\]/g, "");

  const codeSpans = [];
  const protectedText = defootnoted.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return "  CODE" + (codeSpans.length - 1) + "  ";
  });

  const cleaned = protectedText
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<![\w`])_([^_]+)_(?![\w`])/g, "$1")
    .replace(/:::+\s*\{[^}]*\}/g, "")
    .replace(/:::+/g, "")
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.replace(/ CODE(\d+) /g, (_, i) => codeSpans[Number(i)]);
}

function qmdPathFromHref(href) {
  const file = href.split("#")[0];
  const withoutExt = file.replace(/\.html$/, "");
  const qmdPath = path.join(SRC_DIR, withoutExt + ".qmd");
  return existsSync(qmdPath) ? qmdPath : null;
}

function fixSearchIndex() {
  if (!existsSync(SEARCH_JSON)) {
    console.error("Not found: " + SEARCH_JSON + " -- run quarto render first.");
    process.exit(1);
  }

  const entries = JSON.parse(readFileSync(SEARCH_JSON, "utf8"));
  const qmdCache = new Map();
  let fixedCount = 0;

  for (const entry of entries) {
    const qmdPath = qmdPathFromHref(entry.href);
    if (!qmdPath) continue;

    if (!qmdCache.has(qmdPath)) {
      const raw = readFileSync(qmdPath, "utf8");
      // Drop the YAML front matter block before section-splitting.
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
      const stripped = stripExecutableCells(body);
      qmdCache.set(qmdPath, extractSections(stripped));
    }

    const sections = qmdCache.get(qmdPath);
    const anchor = entry.href.includes("#") ? entry.href.split("#")[1] : "";
    const raw = sections[anchor];
    if (raw === undefined) continue;

    const cleaned = toPlainish(raw);
    if (cleaned && cleaned !== entry.text) {
      entry.text = cleaned;
      fixedCount++;
    }
  }

  writeFileSync(SEARCH_JSON, JSON.stringify(entries));
  console.log("post-render-fixups: search index -- rewrote " + fixedCount + "/" + entries.length + " entries in " + SEARCH_JSON);
}

function listHtmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listHtmlFiles(full));
    } else if (name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function fixLogoAlt() {
  if (!existsSync(SITE_DIR)) {
    console.error("Not found: " + SITE_DIR + " -- run quarto render first.");
    process.exit(1);
  }

  // The logo's relative src depends on the page's own directory depth
  // (Quarto adjusts it per page: "./webgeods-logo.svg" at the site
  // root, "../webgeods-logo.svg" one level down under posts//tools/)
  // -- a literal needle only caught the 3 root-level pages, and the
  // first regex fix (only "../" repeated) then silently missed those
  // same 3 root-level "./" pages instead -- caught both times by
  // checking the actual fixed-page count against the real page total
  // (12), not by trusting the script ran without error.
  const needleRe = /src="((?:\.\.?\/)*webgeods-logo\.svg)" alt=""/g;
  let fixedCount = 0;

  for (const file of listHtmlFiles(SITE_DIR)) {
    const html = readFileSync(file, "utf8");
    if (needleRe.test(html)) {
      needleRe.lastIndex = 0;
      writeFileSync(file, html.replace(needleRe, 'src="$1" alt="webgeods"'));
      fixedCount++;
    }
  }

  console.log("post-render-fixups: logo alt -- fixed " + fixedCount + " page(s)");
}

fixSearchIndex();
fixLogoAlt();
