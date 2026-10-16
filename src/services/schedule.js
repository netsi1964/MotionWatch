/**
 * Named time windows during which monitoring is armed.
 * No (enabled) schedules = always armed.
 *
 * @typedef {{ id: string; name: string; days: number[]; start: string; end: string; enabled: boolean }} Schedule
 *   days use Date#getDay(): 0 = Sunday … 6 = Saturday. If end <= start the window runs past midnight
 *   (start === end means the whole day).
 */

export const MAX_SCHEDULES = 8;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const newId = () => "s" + Math.random().toString(36).slice(2, 8);
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Validate stored/user data. */
export function normalizeSchedules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, MAX_SCHEDULES)) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && raw.id && !seen.has(raw.id) ? raw.id : newId();
    seen.add(id);
    const days = Array.isArray(raw.days)
      ? [...new Set(raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [0, 1, 2, 3, 4, 5, 6];
    out.push({
      id,
      name: (typeof raw.name === "string" ? raw.name.trim() : "").slice(0, 40) || `Schedule ${out.length + 1}`,
      days,
      start: TIME_RE.test(raw.start) ? raw.start : "22:00",
      end: TIME_RE.test(raw.end) ? raw.end : "06:00",
      enabled: raw.enabled !== false,
    });
  }
  return out;
}

/** Is `s` running at `now`? */
function isActiveAt(s, now) {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const a = toMin(s.start), b = toMin(s.end);
  if (a === b) return s.days.includes(day);
  if (a < b) return s.days.includes(day) && mins >= a && mins < b;
  return (s.days.includes(day) && mins >= a) || (s.days.includes((day + 6) % 7) && mins < b);
}

/** Latest moment at or before `now` at which `hhmm` occurred (today, or yesterday if it is later than now). */
function prevOccurrence(hhmm, now) {
  const dt = new Date(now);
  dt.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0);
  if (dt > now) dt.setDate(dt.getDate() - 1);
  return dt;
}

/** Date of the next time `hhmm` occurs strictly after `from`, on a day in `days` (for starts). */
function nextOccurrence(hhmm, days, from) {
  for (let d = 0; d <= 7; d++) {
    const dt = new Date(from);
    dt.setDate(dt.getDate() + d);
    dt.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0);
    if (dt > from && (!days || days.includes(dt.getDay()))) return dt;
  }
  return null;
}

/**
 * @param {Schedule[]} schedules
 * @param {Date} [now]
 * @returns {{ restricted: boolean, active: boolean, names: string[], from: Date | null, until: Date | null, next: Date | null, nextUntil: Date | null, nextName: string }}
 *   from/until: the running window; next/nextUntil: the next window to start (when none is running)
 */
export function evaluate(schedules, now = new Date()) {
  const enabled = (schedules || []).filter((s) => s.enabled && s.days.length);
  if (!enabled.length) return { restricted: false, active: true, names: [], from: null, until: null, next: null, nextUntil: null, nextName: "" };

  const running = enabled.filter((s) => isActiveAt(s, now));
  if (running.length) {
    // latest end among the running schedules (they may overlap)
    let until = null, from = null;
    for (const s of running) {
      const e = nextOccurrence(s.end, null, now);   // a start === end window is a full day: it ends at the next such time
      if (e && (!until || e > until)) { until = e; from = prevOccurrence(s.start, now); }
    }
    return { restricted: true, active: true, names: running.map((s) => s.name), from, until, next: null, nextUntil: null, nextName: "" };
  }

  let next = null, nextName = "", nextUntil = null;
  for (const s of enabled) {
    const n = nextOccurrence(s.start, s.days, now);
    if (n && (!next || n < next)) { next = n; nextName = s.name; nextUntil = nextOccurrence(s.end, null, n); }
  }
  return { restricted: true, active: false, names: [], from: null, until: null, next, nextUntil, nextName };
}
