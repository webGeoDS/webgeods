#!/usr/bin/env node
/**
 * Minimal static file server, used by run-smoke-test.sh instead of
 * `quarto preview` for serving already-rendered output.
 *
 * Why: `quarto preview` re-renders embed-resources:true pages from
 * scratch on every single request (no caching), because it inlines
 * every vendored asset (fonts, maplibre-gl.js, codemirror-bundle.js,
 * etc.) as base64 each time. Measured 15-40s per request even on a
 * warm server, occasionally exceeding 90s under load — no network
 * calls involved (confirmed via netstat during the delay), so
 * increasing timeouts only masks it. A smoke test doesn't need
 * `quarto preview`'s live-reload — `quarto render` once (a few
 * seconds) plus serving the static output directly is both faster
 * and deterministic.
 *
 * Usage: node static-server.mjs <directory> <port>
 * Prints "LISTENING" to stdout once ready.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [, , dir, portArg] = process.argv;
if (!dir || !portArg) {
  console.error("Usage: node static-server.mjs <directory> <port>");
  process.exit(1);
}
const ROOT = path.resolve(dir);
const PORT = Number(portArg);

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
};

// Directory-index resolution: a real web server (GitHub Pages
// included) serves index.html for both "/tools/" and "/tools" without
// the caller naming the file — this one only special-cased the root
// "/" and 404'd on any other directory path, breaking in-site links
// (the navbar's "All tools"/"All articles" links, e.g.) when browsing
// a locally-served render.
async function resolveFile(urlPath) {
  const candidates = urlPath.endsWith("/")
    ? [urlPath + "index.html"]
    : [urlPath, urlPath + "/index.html"];
  for (const candidate of candidates) {
    const filePath = path.join(ROOT, candidate);
    try {
      return { filePath, data: await readFile(filePath) };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const found = await resolveFile(urlPath);
  if (found) {
    const ext = path.extname(found.filePath);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": found.data.length,
    });
    res.end(found.data);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("LISTENING");
});
