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

const server = http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, urlPath);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": data.length,
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("LISTENING");
});
