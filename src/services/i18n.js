import { locales, defaultLocale, supportedLocales } from "../i18n/locales.js";

let currentLocale = defaultLocale;
const listeners = new Set();

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 */
export function t(key, params = {}) {
  const dict = locales[currentLocale] || locales[defaultLocale];
  let str = dict[key] ?? locales[defaultLocale][key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return str;
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  if (!supportedLocales.includes(locale)) return;
  if (locale === currentLocale) return;
  currentLocale = locale;
  document.documentElement.lang = locale === "zh-Hans" ? "zh-Hans" : locale;
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listLocales() {
  return supportedLocales.map((code) => ({
    code,
    label: locales[code].language || code,
  }));
}

/** Format date/time for overlay and UI using current locale */
export function formatDateTime(date = new Date(), options = {}) {
  const localeTag = currentLocale === "zh-Hans" ? "zh-CN" : currentLocale;
  return new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...options,
  }).format(date);
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
