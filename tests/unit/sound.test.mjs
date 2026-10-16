import test from "node:test";
import assert from "node:assert/strict";
import { SoundDetector } from "../../src/services/sound.js";

/** A detector wired to a fake analyser that returns a constant-amplitude signal. */
function fake(amplitude) {
  const d = new SoundDetector();
  d.analyser = { getFloatTimeDomainData: (buf) => buf.fill(amplitude) };
  d.buf = new Float32Array(1024);
  return d;
}

test("threshold moves from -20 dB (insensitive) to -60 dB (very sensitive)", () => {
  const d = new SoundDetector();
  d.setSensitivity(0);
  assert.equal(d.thresholdDb(), -20);
  d.setSensitivity(100);
  assert.equal(d.thresholdDb(), -60);
  d.setSensitivity(50);
  assert.equal(d.thresholdDb(), -40);
  d.setSensitivity(500);
  assert.equal(d.sensitivity, 100, "clamped");
});

test("threshold marker sits on the 0-100 meter scale", () => {
  const d = new SoundDetector();
  d.setSensitivity(50);
  assert.ok(d.thresholdLevel() > 0 && d.thresholdLevel() < 100);
  d.setSensitivity(0);
  const strict = d.thresholdLevel();
  d.setSensitivity(100);
  assert.ok(d.thresholdLevel() < strict, "more sensitive = lower tick");
});

test("loud sound must be sustained before it triggers", () => {
  const d = fake(0.5); // about -6 dBFS
  d.setSensitivity(50);
  assert.equal(d.poll(100), false);
  assert.equal(d.poll(200), true, "second consecutive sample");
  assert.ok(d.db > -10);
  assert.ok(d.level > 90);
});

test("quiet signal never triggers and resets the streak", () => {
  const d = fake(0.001); // about -60 dBFS
  d.setSensitivity(0);
  for (let t = 100; t < 1000; t += 100) assert.equal(d.poll(t), false);
  d.analyser.getFloatTimeDomainData = (buf) => buf.fill(0.5);
  d.poll(1100);
  d.analyser.getFloatTimeDomainData = (buf) => buf.fill(0.0001);
  d.poll(1200);
  d.analyser.getFloatTimeDomainData = (buf) => buf.fill(0.5);
  assert.equal(d.poll(1300), false, "streak was broken by the quiet sample");
});

test("polling is rate limited and inactive without an analyser", () => {
  const d = fake(0.5);
  d.poll(100);
  const db = d.db;
  d.analyser.getFloatTimeDomainData = (buf) => buf.fill(0.0001);
  d.poll(110); // too soon: ignored
  assert.equal(d.db, db);
  assert.equal(new SoundDetector().active, false);
  assert.equal(new SoundDetector().poll(1), false);
});

test("meter falls back slowly (slow release)", () => {
  const d = fake(0.5);
  d.setSensitivity(50);
  d.poll(100);
  const peak = d.level;
  d.analyser.getFloatTimeDomainData = (buf) => buf.fill(0.0001);
  d.poll(200);
  assert.ok(d.level < peak && d.level > peak * 0.5);
});
