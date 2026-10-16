import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, normalizeSchedules, MAX_SCHEDULES } from "../../src/services/schedule.js";

const mk = (o = {}) => normalizeSchedules([{ name: "N", days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "06:00", ...o }]);
// Friday 2026-10-16, Saturday 17, Sunday 18
const at = (h, m = 0, day = 16) => new Date(2026, 9, day, h, m);

test("no schedules means unrestricted (always monitoring)", () => {
  const r = evaluate([], at(12));
  assert.equal(r.restricted, false);
  assert.equal(r.active, true);
});

test("disabled or day-less schedules are ignored", () => {
  assert.equal(evaluate(mk({ enabled: false }), at(12)).restricted, false);
  assert.equal(evaluate(mk({ days: [] }), at(12)).restricted, false);
});

test("same-day window: start inclusive, end exclusive", () => {
  const s = mk({ start: "09:00", end: "17:00" });
  assert.equal(evaluate(s, at(8, 59)).active, false);
  assert.equal(evaluate(s, at(9, 0)).active, true);
  assert.equal(evaluate(s, at(16, 59)).active, true);
  assert.equal(evaluate(s, at(17, 0)).active, false);
});

test("window past midnight is active on both sides of midnight", () => {
  const s = mk();
  assert.equal(evaluate(s, at(23)).active, true);
  assert.equal(evaluate(s, at(3)).active, true);
  assert.equal(evaluate(s, at(6, 0)).active, false);
  assert.equal(evaluate(s, at(12)).active, false);
});

test("days apply to the day the window STARTS", () => {
  const satOnly = mk({ days: [6] });
  assert.equal(evaluate(satOnly, at(23, 0, 16)).active, false, "Friday night is not Saturday");
  assert.equal(evaluate(satOnly, at(23, 0, 17)).active, true, "Saturday night");
  assert.equal(evaluate(satOnly, at(2, 0, 18)).active, true, "spills into Sunday morning");
  assert.equal(evaluate(satOnly, at(7, 0, 18)).active, false);
});

test("start === end means the whole day on the listed days", () => {
  const s = mk({ start: "08:00", end: "08:00" });
  assert.equal(evaluate(s, at(15)).active, true);
});

test("reports when the running window ends and when the next one starts", () => {
  const running = evaluate(mk(), at(23));
  assert.equal(running.active, true);
  assert.equal(running.until.getDate(), 17);
  assert.equal(running.until.getHours(), 6);

  const waiting = evaluate(mk({ days: [6] }), at(12));
  assert.equal(waiting.active, false);
  assert.equal(waiting.next.getDay(), 6);
  assert.equal(waiting.next.getHours(), 22);
  assert.equal(waiting.nextName, "N");
});

test("normalizeSchedules validates and caps", () => {
  const out = normalizeSchedules([
    { name: "  ", days: [1, 1, 9, "x", 3], start: "25:00", end: "ab", enabled: false },
    null,
    "junk",
  ]);
  assert.equal(out.length, 1);
  assert.match(out[0].name, /^Schedule 1$/);
  assert.deepEqual(out[0].days, [1, 3]);
  assert.equal(out[0].start, "22:00");
  assert.equal(out[0].end, "06:00");
  assert.equal(out[0].enabled, false);
  assert.ok(out[0].id);

  const many = normalizeSchedules(Array.from({ length: 30 }, (_, i) => ({ name: `s${i}` })));
  assert.equal(many.length, MAX_SCHEDULES);
  assert.equal(new Set(many.map((s) => s.id)).size, many.length, "ids are unique");
  assert.deepEqual(normalizeSchedules("nope"), []);
});

test("a running window reports when it began and when it ends (also past midnight)", () => {
  const night = mk();                                           // 22:00 - 06:00, every day
  const late = evaluate(night, at(23, 30));
  assert.equal(late.from.getDate(), 16);
  assert.equal(late.from.getHours(), 22);
  assert.equal(late.until.getDate(), 17);
  assert.equal(late.until.getHours(), 6);

  const early = evaluate(night, at(3, 0));                      // after midnight: it began yesterday
  assert.equal(early.from.getDate(), 15);
  assert.equal(early.from.getHours(), 22);
  assert.equal(early.until.getDate(), 16);
  assert.equal(early.until.getHours(), 6);

  const day = evaluate(mk({ start: "09:00", end: "17:00" }), at(12));
  assert.deepEqual([day.from.getHours(), day.until.getHours(), day.from.getDate(), day.until.getDate()], [9, 17, 16, 16]);
});

test("a waiting schedule reports its whole next window (start and end)", () => {
  const r = evaluate(mk({ start: "09:00", end: "17:00" }), at(20));   // Friday evening: next window is Saturday
  assert.equal(r.active, false);
  assert.deepEqual([r.next.getDate(), r.next.getHours(), r.nextUntil.getDate(), r.nextUntil.getHours()], [17, 9, 17, 17]);

  const overnight = evaluate(mk(), at(12));
  assert.deepEqual([overnight.next.getDate(), overnight.next.getHours(), overnight.nextUntil.getDate(), overnight.nextUntil.getHours()], [16, 22, 17, 6]);
});

test("a whole-day window ends 24 hours after it began", () => {
  const r = evaluate(mk({ start: "08:00", end: "08:00" }), at(15));
  assert.equal(r.active, true);
  assert.equal(r.from.getHours(), 8);
  assert.equal(r.until.getHours(), 8);
  assert.equal(r.until.getDate(), 17);
});
