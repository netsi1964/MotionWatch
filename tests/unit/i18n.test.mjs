import test from "node:test";
import assert from "node:assert/strict";
import { locales, defaultLocale } from "../../src/i18n/locales.js";

const en = locales[defaultLocale];
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every locale has exactly the English keys", () => {
  for (const [code, dict] of Object.entries(locales)) {
    const missing = Object.keys(en).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in en));
    assert.deepEqual(missing, [], `${code} is missing keys`);
    assert.deepEqual(extra, [], `${code} has unknown keys`);
  }
});

test("no empty strings", () => {
  for (const [code, dict] of Object.entries(locales)) {
    for (const [k, v] of Object.entries(dict)) assert.ok(typeof v === "string" && v.trim(), `${code}.${k} is empty`);
  }
});

test("placeholders match across languages", () => {
  for (const [code, dict] of Object.entries(locales)) {
    for (const k of Object.keys(en)) assert.equal(placeholders(dict[k]), placeholders(en[k]), `${code}.${k}`);
  }
});

test("all source code t() keys exist", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const used = new Set();
  for (const f of walk("src").filter((f) => f.endsWith(".js") && !f.includes("locales.js"))) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of text.matchAll(/\btxt\("[^"]+",\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, [], "keys used in code but missing from the locales");
});
