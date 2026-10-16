// Minimal static file server for the e2e tests (no dependencies).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon",
};

/** Test hook: POST /__override {path, body} replaces a file; POST /__override/clear restores everything. */
const overrides = new Map();

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname.startsWith("/__override")) {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      if (url.pathname === "/__override/clear") overrides.clear();
      else { const { path: p, body } = JSON.parse(raw); overrides.set(p, body); }
      res.writeHead(204).end();
    });
    return;
  }
  if (overrides.has(url.pathname)) {
    res.writeHead(200, { "content-type": types[path.extname(url.pathname)] || "text/plain", "cache-control": "no-store" });
    res.end(overrides.get(url.pathname));
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
