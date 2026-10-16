import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VERSION } from "../../src/version.js";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test("version has the form versionYYYY-MM-DD-HH-MM", () => {
  assert.match(VERSION, /^version\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/);
});

test("the service worker cache name carries the version", () => {
  const sw = fs.readFileSync("sw.js", "utf8");
  assert.ok(sw.includes(`motionwatch-shell-${VERSION}`), "run scripts/bump-version.sh before deploying");
});

test("every service-worker asset exists and every src file is cached", () => {
  const sw = fs.readFileSync("sw.js", "utf8");
  const assets = [...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]);
  for (const a of assets) assert.ok(fs.existsSync(a === "./" ? "index.html" : a.slice(2)), `missing ${a}`);
  const uncached = walk("src").map((f) => "./" + f.split(path.sep).join("/")).filter((f) => !assets.includes(f));
  assert.deepEqual(uncached, []);
});

test("manifest and index.html are consistent", () => {
  const m = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
  assert.equal(m.start_url, "./", "relative start_url works under /<repo>/ on GitHub Pages");
  const html = fs.readFileSync("index.html", "utf8");
  for (const [, ref] of html.matchAll(/(?:src|href)="((?!data:|http)[^"]+)"/g)) assert.ok(fs.existsSync(ref), `index.html references missing ${ref}`);
  assert.match(html, /viewport-fit=cover/);
});

test("app uses relative URLs only (GitHub Pages serves from a sub-path)", () => {
  for (const f of ["index.html", "sw.js", "src/main.js"]) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /(?:src|href|register\()\s*=?\s*["']\/(?!\/)/, `${f} has a root-absolute URL`);
  }
});

test("JavaScript sources parse", async () => {
  const { execFileSync } = await import("node:child_process");
  for (const f of walk("src").filter((f) => f.endsWith(".js"))) {
    execFileSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(f), stdio: ["pipe", "ignore", "pipe"] });
  }
});

test("index.html uses the standard mobile-web-app-capable meta (Chrome deprecates the apple one)", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.doesNotMatch(html, /apple-mobile-web-app-capable/);
});
