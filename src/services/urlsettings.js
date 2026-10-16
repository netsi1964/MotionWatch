/**
 * Settings <-> URL query parameters, so a configuration can be bookmarked or shared.
 *
 *   ?s=60&q=8&lang=da&quality=high&clip=5&awake=0&audio=1&sound=1&ss=60&theme=dark&preview=canvas
 *   &area=Door~e~20~20~40~50&area=Hall~p~10,10,50,10,30,60
 *   &sched=Night~12345~2200~0600~1
 *
 * Only values that differ from the defaults are written.
 */

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const num = (v) => (v == null || v === "" ? NaN : Number(v));
const bool = (v) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined);
const pct = (v) => Math.round(v * 1000) / 10; // 0.256 -> 25.6
const clean = (s) => String(s).replace(/[~]/g, " ").trim();

/** @param {string} search  e.g. location.search @returns {Record<string, any>} partial settings */
export function parseQuery(search) {
  const q = new URLSearchParams(search);
  /** @type {Record<string, any>} */
  const out = {};
  let n = num(q.get("s")); if (Number.isFinite(n)) out.sensitivity = clampInt(n, 0, 100);
  n = num(q.get("q")); if (Number.isFinite(n)) out.quietPeriodSec = clampInt(n, 1, 60);
  n = num(q.get("clip")); if (Number.isFinite(n)) out.maxClipMinutes = clampInt(n, 0, 60);
  n = num(q.get("ss")); if (Number.isFinite(n)) out.soundSensitivity = clampInt(n, 0, 100);
  const lang = q.get("lang"); if (lang) out.language = lang;
  const quality = q.get("quality"); if (["low", "medium", "high"].includes(quality)) out.videoQuality = quality;
  const theme = q.get("theme"); if (["auto", "light", "dark"].includes(theme)) out.theme = theme;
  const preview = q.get("preview"); if (["auto", "video", "canvas"].includes(preview)) out.preview = preview;
  for (const [param, key] of [["awake", "keepAwake"], ["audio", "recordAudio"], ["sound", "soundTrigger"]]) {
    const b = bool(q.get(param));
    if (b !== undefined) out[key] = b;
  }

  const areas = q.getAll("area").map(parseArea).filter(Boolean);
  if (areas.length) out.detectionAreas = areas;
  const scheds = q.getAll("sched").map(parseSched).filter(Boolean);
  if (scheds.length) out.schedules = scheds;
  return out;
}

/** Trailing tokens after the geometry: `0` = disabled, `sNN` = own sensitivity. */
function extras(tokens) {
  let enabled = true, sensitivity = null;
  for (const t of tokens) {
    if (t === "0") enabled = false;
    else if (/^s\d{1,3}$/.test(t)) sensitivity = Math.max(0, Math.min(100, Number(t.slice(1))));
  }
  return { enabled, sensitivity };
}

function parseArea(str) {
  const p = str.split("~");
  if (p.length < 3) return null;
  const name = p[0];
  if (p[1] === "p") {
    const nums = p[2].split(",").map(Number);
    if (nums.length < 6 || nums.length % 2 || nums.some((x) => !Number.isFinite(x))) return null;
    const points = [];
    for (let i = 0; i < nums.length; i += 2) points.push([nums[i] / 100, nums[i + 1] / 100]);
    return { name, shape: "polygon", points, ...extras(p.slice(3)) };
  }
  if (p[1] === "r" || p[1] === "e") {
    const [x, y, w, h] = p.slice(2, 6).map((v) => Number(v) / 100);
    if ([x, y, w, h].some((v) => !Number.isFinite(v))) return null;
    return { name, shape: p[1] === "e" ? "ellipse" : "rect", x, y, w, h, ...extras(p.slice(6)) };
  }
  return null;
}

function parseSched(str) {
  const p = str.split("~");
  if (p.length < 4) return null;
  const hm = (s) => (/^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : null);
  const start = hm(p[2]), end = hm(p[3]);
  if (!start || !end) return null;
  const days = [...new Set(p[1].split("").map(Number).filter((d) => d >= 0 && d <= 6))];
  return { name: p[0], days, start, end, enabled: p[4] !== "0" };
}

/**
 * @param {Record<string, any>} s current settings
 * @param {Record<string, any>} defaults
 * @returns {string} query string without the leading "?" (may be empty)
 */
export function toQuery(s, defaults) {
  const q = new URLSearchParams();
  const diff = (key) => s[key] !== defaults[key];
  if (diff("sensitivity")) q.set("s", String(s.sensitivity));
  if (diff("quietPeriodSec")) q.set("q", String(s.quietPeriodSec));
  if (diff("maxClipMinutes")) q.set("clip", String(s.maxClipMinutes));
  if (diff("videoQuality")) q.set("quality", s.videoQuality);
  if (diff("language")) q.set("lang", s.language);
  if (diff("theme")) q.set("theme", s.theme);
  if (diff("preview")) q.set("preview", s.preview);
  if (diff("keepAwake")) q.set("awake", s.keepAwake ? "1" : "0");
  if (diff("recordAudio")) q.set("audio", s.recordAudio ? "1" : "0");
  if (diff("soundTrigger")) q.set("sound", s.soundTrigger ? "1" : "0");
  if (diff("soundSensitivity")) q.set("ss", String(s.soundSensitivity));

  for (const a of s.detectionAreas || []) {
    const off = (a.enabled ? "" : "~0") + (a.sensitivity != null ? `~s${a.sensitivity}` : "");
    if (a.shape === "polygon") {
      q.append("area", `${clean(a.name)}~p~${a.points.map((p) => `${pct(p[0])},${pct(p[1])}`).join(",")}${off}`);
    } else {
      q.append("area", `${clean(a.name)}~${a.shape === "ellipse" ? "e" : "r"}~${pct(a.x)}~${pct(a.y)}~${pct(a.w)}~${pct(a.h)}${off}`);
    }
  }
  for (const sc of s.schedules || []) {
    q.append("sched", `${clean(sc.name)}~${sc.days.join("")}~${sc.start.replace(":", "")}~${sc.end.replace(":", "")}~${sc.enabled ? 1 : 0}`);
  }
  // keep ~ , : readable in the address bar
  return q.toString().replace(/%7E/gi, "~").replace(/%2C/gi, ",").replace(/%3A/gi, ":");
}
