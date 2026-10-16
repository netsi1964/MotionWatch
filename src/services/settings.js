const STORAGE_KEY = "motionwatch-settings-v1";

import { normalizeAreas } from "./areas.js";
import { normalizeSchedules } from "./schedule.js";
import { parseQuery, toQuery } from "./urlsettings.js";

/** @typedef {{
 *   sensitivity: number; // 0-100
 *   quietPeriodSec: number;
 *   language: string;
 *   keepAwake: boolean;
 *   videoQuality: 'low' | 'medium' | 'high';
 *   maxClipMinutes: number;
 *   selectedDeviceId: string | null;
 *   detectionAreas: import("./areas.js").Area[]; // empty = whole frame
 *   schedules: import("./schedule.js").Schedule[]; // empty = always armed
 *   recordAudio: boolean;
 *   soundTrigger: boolean;
 *   soundSensitivity: number; // 0-100
 *   theme: 'auto' | 'light' | 'dark';
 *   preview: 'auto' | 'video' | 'canvas'; // how the live picture is painted
 * }} Settings */

/** @type {Settings} */
const defaults = {
  sensitivity: 40,
  quietPeriodSec: 5,
  language: "en",
  keepAwake: true,
  videoQuality: "medium",
  maxClipMinutes: 0,
  selectedDeviceId: null,
  detectionAreas: [],
  schedules: [],
  recordAudio: false,
  soundTrigger: false,
  soundSensitivity: 50,
  theme: "auto",
  preview: "auto",
};

/** @type {Settings} */
let current = { ...defaults };
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      current = { ...defaults, ...parsed };
      delete current.detectionRegion;
      // migrate the earlier single-rectangle setting
      const legacy = parsed.detectionRegion;
      current.detectionAreas = normalizeAreas(
        parsed.detectionAreas ?? (legacy ? [{ name: "Area 1", shape: "rect", ...legacy }] : [])
      );
      current.schedules = normalizeSchedules(parsed.schedules);
      current.recordAudio = parsed.recordAudio === true;
      current.soundTrigger = parsed.soundTrigger === true;
    }
  } catch {
    current = { ...defaults };
  }
}

function save() {
  syncUrl();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn("Failed to persist settings", e);
  }
}

/** Query parameters win over what is stored, then become the stored settings. */
function applyUrl() {
  try {
    const fromUrl = parseQuery(location.search);
    if (!Object.keys(fromUrl).length) return;
    current = { ...current, ...fromUrl };
    current.detectionAreas = normalizeAreas(current.detectionAreas);
    current.schedules = normalizeSchedules(current.schedules);
    if (!["auto", "light", "dark"].includes(current.theme)) current.theme = "auto";
    if (!["auto", "video", "canvas"].includes(current.preview)) current.preview = "auto";
    save();
  } catch (e) {
    console.warn("Ignoring invalid settings in URL", e);
  }
}

let urlTimer = 0;
/** Mirror the settings into the address bar (debounced) so the link can be shared. */
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    try {
      const qs = toQuery(current, defaults);
      history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    } catch { /* history API unavailable */ }
  }, 250);
}

load();
applyUrl();
syncUrl();

export function getSettings() {
  return { ...current };
}

/**
 * @param {Partial<Settings>} partial
 */
export function updateSettings(partial) {
  current = { ...current, ...partial };
  if ("detectionAreas" in partial) current.detectionAreas = normalizeAreas(partial.detectionAreas);
  if ("schedules" in partial) current.schedules = normalizeSchedules(partial.schedules);
  save();
  listeners.forEach((fn) => fn(getSettings()));
}

export function resetSettings() {
  current = { ...defaults };
  save();
  listeners.forEach((fn) => fn(getSettings()));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { defaults as defaultSettings };
