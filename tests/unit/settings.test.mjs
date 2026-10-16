import test from "node:test";
import assert from "node:assert/strict";

/** Import a fresh copy of settings.js with fake browser globals. */
let n = 0;
async function load({ stored, search = "" } = {}) {
  const store = new Map(stored ? [["motionwatch-settings-v1", JSON.stringify(stored)]] : []);
  const calls = [];
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  globalThis.location = { search, pathname: "/app/", hash: "" };
  globalThis.history = { state: null, replaceState: (_s, _t, url) => calls.push(url) };
  const mod = await import(`../../src/services/settings.js?case=${n++}`);
  return { ...mod, store, calls };
}

test("defaults", async () => {
  const s = (await load()).getSettings();
  assert.equal(s.sensitivity, 40);
  assert.equal(s.theme, "auto");
  assert.equal(s.preview, "auto");
  assert.deepEqual(s.detectionAreas, []);
  assert.deepEqual(s.schedules, []);
  assert.equal(s.recordAudio, false);
  assert.equal(s.soundTrigger, false);
});

test("stored values are loaded and sanitised", async () => {
  const { getSettings } = await load({ stored: { sensitivity: 80, schedules: [{ name: "x", days: [1], start: "bad", end: "07:00" }], detectionAreas: [{ shape: "rect", x: 9, y: 9, w: 9, h: 9 }] } });
  const s = getSettings();
  assert.equal(s.sensitivity, 80);
  assert.equal(s.schedules[0].start, "22:00");
  assert.equal(s.detectionAreas.length, 1);
  assert.ok(s.detectionAreas[0].x + s.detectionAreas[0].w <= 1);
});

test("the old single-rectangle setting migrates to one named area", async () => {
  const { getSettings } = await load({ stored: { detectionRegion: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } } });
  const s = getSettings();
  assert.equal(s.detectionAreas.length, 1);
  assert.equal(s.detectionAreas[0].name, "Area 1");
  assert.equal(s.detectionAreas[0].shape, "rect");
  assert.equal("detectionRegion" in s, false);
});

test("URL parameters override stored settings and are persisted", async () => {
  const { getSettings, store } = await load({ stored: { sensitivity: 10 }, search: "?s=77&theme=dark&area=Door~e~20~20~40~50" });
  const s = getSettings();
  assert.equal(s.sensitivity, 77);
  assert.equal(s.theme, "dark");
  assert.equal(s.detectionAreas[0].name, "Door");
  assert.equal(JSON.parse(store.get("motionwatch-settings-v1")).sensitivity, 77);
});

test("changes are mirrored into the URL, defaults produce a clean URL", async (t) => {
  const { updateSettings, resetSettings, calls } = await load();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  updateSettings({ sensitivity: 65 });
  t.mock.timers.tick(300);
  assert.equal(calls.at(-1), "/app/?s=65");
  resetSettings();
  t.mock.timers.tick(300);
  assert.equal(calls.at(-1), "/app/");
});

test("updateSettings normalises areas and schedules and notifies listeners", async () => {
  const { updateSettings, getSettings, onSettingsChange } = await load();
  let seen = null;
  const off = onSettingsChange((s) => { seen = s; });
  updateSettings({ detectionAreas: [{ shape: "rect", x: -3, y: 0, w: 0.5, h: 0.5 }, { shape: "polygon", points: [] }] });
  assert.equal(getSettings().detectionAreas.length, 1);
  assert.equal(getSettings().detectionAreas[0].x, 0);
  assert.equal(seen.detectionAreas.length, 1);
  off();
});

test("invalid theme/preview from the URL fall back to auto", async () => {
  const s = (await load({ search: "?theme=pink&preview=gpu&s=20" })).getSettings();
  assert.equal(s.theme, "auto");
  assert.equal(s.preview, "auto");
  assert.equal(s.sensitivity, 20);
});
