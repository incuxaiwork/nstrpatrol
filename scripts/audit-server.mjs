#!/usr/bin/env node
/**
 * Static server for the GIS audit harness. Serves maplibre-gl (from web
 * node_modules), the layer bundle, and the harness page. No dependencies.
 * Usage: node scripts/audit-server.mjs <port>
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "web");
const PORT = Number(process.argv[2] ?? 9399);
const AUDIT = join(ROOT, "scripts", ".audit");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  let disk;
  if (path === "/" || path === "/harness") disk = join(AUDIT, "harness.html");
  else if (path.startsWith("/audit/")) disk = join(AUDIT, path.slice("/audit/".length));
  else disk = join(WEB, path.replace(/^\/+/, ""));

  if (path.startsWith("/ml/")) disk = join(WEB, "node_modules", "maplibre-gl", "dist", path.slice("/ml/".length));

  if (!existsSync(disk)) {
    res.writeHead(404); res.end("not found: " + path); return;
  }
  const body = readFileSync(disk);
  res.writeHead(200, { "Content-Type": MIME[extname(disk)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
});
server.listen(PORT, () => console.log(`audit server on http://127.0.0.1:${PORT}/harness`));