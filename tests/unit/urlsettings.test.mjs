import test from "node:test";
import assert from "node:assert/strict";
import { parseQuery, toQuery } from "../../src/services/urlsettings.js";

const defaults = {
  sensitivity: 40, quietPeriodSec: 5, language: "en", keepAwake: true, videoQuality: "medium", maxClipMinutes: 0,
  detectionAreas: [], schedules: [], recordAudio: false, soundTrigger: false, soundSensitivity: 50, theme: "auto", preview: "auto",
};

test("defaults produce an empty query", () => {
  assert.equal(toQuery(defaults, defaults), "");
});

test("scalar settings round-trip", () => {
  const s = { ...defaults, sensitivity: 70, quietPeriodSec: 9, maxClipMinutes: 3, videoQuality: "high", language: "da",
    theme: "light", preview: "canvas", keepAwake: false, recordAudio: true, soundTrigger: true, soundSensitivity: 30 };
  const q = toQuery(s, defaults);
  const back = parseQuery(q);
  assert.equal(back.sensitivity, 70);
  assert.equal(back.quietPeriodSec, 9);
  assert.equal(back.maxClipMinutes, 3);
  assert.equal(back.videoQuality, "high");
  assert.equal(back.language, "da");
  assert.equal(back.theme, "light");
  assert.equal(back.preview, "canvas");
  assert.equal(back.keepAwake, false);
  assert.equal(back.recordAudio, true);
  assert.equal(back.soundTrigger, true);
  assert.equal(back.soundSensitivity, 30);
});

test("only changed values are written", () => {
  const q = toQuery({ ...defaults, sensitivity: 55 }, defaults);
  assert.equal(q, "s=55");
});

test("areas and schedules round-trip, including disabled ones and polygons", () => {
  const s = {
    ...defaults,
    detectionAreas: [
      { name: "Door", shape: "ellipse", x: 0.2, y: 0.2, w: 0.4, h: 0.5, enabled: true },
      { name: "Hall", shape: "polygon", points: [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]], enabled: false },
      { name: "Box", shape: "rect", x: 0.0505, y: 0.1, w: 0.25, h: 0.5, enabled: true },
    ],
    schedules: [{ name: "Night", days: [1, 2, 3], start: "22:00", end: "06:00", enabled: true },
      { name: "Off", days: [0], start: "08:30", end: "09:45", enabled: false }],
  };
  const q = toQuery(s, defaults);
  assert.match(q, /area=Door~e~20~20~40~50/);
  assert.match(q, /sched=Night~123~2200~0600~1/);
  const back = parseQuery(q);
  assert.equal(back.detectionAreas.length, 3);
  assert.equal(back.detectionAreas[0].shape, "ellipse");
  assert.equal(back.detectionAreas[1].enabled, false);
  assert.equal(back.detectionAreas[1].points.length, 3);
  assert.ok(Math.abs(back.detectionAreas[2].x - 0.051) < 1e-9, "percent with one decimal");
  assert.deepEqual(back.schedules.map((x) => [x.name, x.days.join(""), x.start, x.end, x.enabled]),
    [["Night", "123", "22:00", "06:00", true], ["Off", "0", "08:30", "09:45", false]]);
});

test("invalid values are ignored", () => {
  const back = parseQuery("?s=abc&q=&theme=pink&quality=ultra&preview=gpu&area=bad&area=x~z~1~2&sched=x~y&audio=maybe&lang=");
  assert.deepEqual(back, {});
});

test("numbers are clamped", () => {
  const back = parseQuery("s=500&q=0&clip=999&ss=-5");
  assert.equal(back.sensitivity, 100);
  assert.equal(back.quietPeriodSec, 1);
  assert.equal(back.maxClipMinutes, 60);
  assert.equal(back.soundSensitivity, 0);
});

test("names with the separator character cannot break the format", () => {
  const q = toQuery({ ...defaults, detectionAreas: [{ name: "a~b", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, enabled: true }] }, defaults);
  const back = parseQuery(q);
  assert.equal(back.detectionAreas.length, 1);
  assert.equal(back.detectionAreas[0].name, "a b");
});

test("per-area sensitivity round-trips alongside the disabled flag", () => {
  const s = { ...defaults, detectionAreas: [
    { name: "Door", shape: "ellipse", x: 0.2, y: 0.2, w: 0.4, h: 0.5, enabled: true, sensitivity: 70 },
    { name: "Hall", shape: "polygon", points: [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]], enabled: false, sensitivity: 0 },
    { name: "Yard", shape: "rect", x: 0.5, y: 0.5, w: 0.4, h: 0.4, enabled: true, sensitivity: null },
  ] };
  const q = toQuery(s, defaults);
  assert.match(q, /area=Door~e~20~20~40~50~s70/);
  assert.match(q, /area=Hall~p~10,10,50,10,30,60~0~s0/);
  assert.match(q, /area=Yard~r~50~50~40~40(&|$)/);
  const back = parseQuery(q).detectionAreas;
  assert.deepEqual(back.map((a) => [a.name, a.enabled, a.sensitivity]), [["Door", true, 70], ["Hall", false, 0], ["Yard", true, null]]);
});

test("sensitivity tokens are clamped and bad ones ignored", () => {
  const [a, b] = parseQuery("area=A~r~0~0~50~50~s250&area=B~r~0~0~50~50~sx").detectionAreas;
  assert.equal(a.sensitivity, 100);
  assert.equal(b.sensitivity, null);
});

test("one-off schedule dates round-trip", () => {
  const q = toQuery({ ...defaults, schedules: [{ name: "Trip", days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "08:00", enabled: true, date: "2026-10-16", endDate: "2026-10-18" }] }, defaults);
  assert.match(q, /sched=Trip~0123456~2200~0800~1~d20261016-20261018/);
  const [s] = parseQuery("?" + q).schedules;
  assert.deepEqual([s.date, s.endDate], ["2026-10-16", "2026-10-18"]);
});
